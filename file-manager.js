// Render breadcrumb navigation
    function renderBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        let path = [{id: null, name: 'الرئيسية'}].concat(currentPath);
        path.forEach((folder, idx) => {
            const span = document.createElement('span');
            span.textContent = folder.name;
            span.style.cursor = 'pointer';
            span.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            span.style.direction = 'rtl';
            span.onclick = () => {
                currentPath = currentPath.slice(0, idx);
                currentParentId = folder.id;
                loadFolders();
            };
            breadcrumb.appendChild(span);
            if (idx < path.length - 1) {
                breadcrumb.appendChild(document.createTextNode(' / '));
            }
        });
    }

    // Show/hide loader
    function showLoader() {
        document.getElementById('loader').style.display = 'block';
    }
    function hideLoader() {
        document.getElementById('loader').style.display = 'none';
    }

    // Load folders and items in current directory (فلترة حسب userId)
    async function loadFolders() {
        renderBreadcrumb();
        showLoader();
        const foldersDiv = document.getElementById('folders');
        foldersDiv.innerHTML = '';
        if (!currentUserId) {
            hideLoader();
            return;
        }
        // Load folders (فقط للمستخدم الحالي)
        let folderQuery = db.collection('folders')
            .where('parentId', '==', currentParentId)
            .where('userId', '==', currentUserId);
        const folderSnap = await folderQuery.get();
        // Load items (videos/files) (فقط للمستخدم الحالي)
        let itemQuery = db.collection('items')
            .where('parentId', '==', currentParentId)
            .where('userId', '==', currentUserId);
        const itemSnap = await itemQuery.get();
        hideLoader();
        foldersDiv.innerHTML = '';

        // --- حساب أعداد الفيديوهات والملفات ومدة الفيديوهات داخل كل مجلد (جذرى أو فرعى) ---
        // جلب الفيديوهات فقط
        async function getCountsAndDurations(folderId, youtubeApiKey) {
            // 1. احصاء العناصر المباشرة داخل هذا المجلد
            const videosSnap = await db.collection('items')
                .where('parentId', '==', folderId)
                .where('userId', '==', currentUserId)
                .where('type', '==', 'video')
                .get();
            const filesSnap = await db.collection('items')
                .where('parentId', '==', folderId)
                .where('userId', '==', currentUserId)
                .where('type', '==', 'file')
                .get();

            // حساب مدة الفيديوهات
            let totalDuration = 0;
            const ytIds = [];
            const mp4Urls = [];
            videosSnap.forEach(doc => {
                const d = doc.data();
                if (isYouTubeUrl(d.url)) {
                    const vid = extractYouTubeId(d.url);
                    if (vid) ytIds.push(vid);
                } else if (isLiveStreamUrl(d.url) && /\.mp4$/i.test(d.url)) {
                    mp4Urls.push(d.url);
                }
            });

            // YouTube durations
            let ytDurations = {};
            if (ytIds.length && youtubeApiKey) {
                ytDurations = await fetchYouTubeDurations(ytIds, youtubeApiKey);
            }

            // MP4 durations
            let mp4Durations = [];
            if (mp4Urls.length) {
                mp4Durations = await Promise.all(mp4Urls.map(getMp4Duration));
            }

            // Sum durations
            let ytIdx = 0, mp4Idx = 0;
            videosSnap.forEach(doc => {
                const d = doc.data();
                if (isYouTubeUrl(d.url)) {
                    const vid = extractYouTubeId(d.url);
                    if (vid && ytDurations[vid]) totalDuration += ytDurations[vid];
                    ytIdx++;
                } else if (isLiveStreamUrl(d.url) && /\.mp4$/i.test(d.url)) {
                    if (mp4Durations[mp4Idx]) totalDuration += mp4Durations[mp4Idx];
                    mp4Idx++;
                }
                // Ignore other types (live streams, etc)
            });

            // 2. اجلب كل المجلدات الفرعية وكرر نفس الدالة عليها (بشكل متوازى)
            const subfoldersSnap = await db.collection('folders')
                .where('parentId', '==', folderId)
                .where('userId', '==', currentUserId)
                .get();

            // بدلاً من for-await المتسلسل، استخدم Promise.all للتوازى
            const subCountsArr = await Promise.all(
                subfoldersSnap.docs.map(subDoc =>
                    getCountsAndDurations(subDoc.id, youtubeApiKey)
                )
            );
            let subCounts = { videos: 0, files: 0, totalDuration: 0 };
            for (const sub of subCountsArr) {
                subCounts.videos += sub.videos;
                subCounts.files += sub.files;
                subCounts.totalDuration += sub.totalDuration;
            }

            // 3. اجمع النتائج
            return {
                videos: videosSnap.size + subCounts.videos,
                files: filesSnap.size + subCounts.files,
                totalDuration: totalDuration + subCounts.totalDuration
            };
        }
        // --- نهاية الحساب ---

        // --- جلب الأعداد والمدة لكل مجلد قبل العرض ---
        // تعديل هنا: رتب المجلدات الفرعية حسب createdAt (من الأقدم إلى الأحدث)
        let folderDocs = folderSnap.docs;
        // استبدل الترتيب ليأخذ order أولاً ثم createdAt
        folderDocs.sort((a, b) => {
            const aOrder = a.data().order;
            const bOrder = b.data().order;
            if (aOrder !== undefined && bOrder !== undefined) {
                return aOrder - bOrder;
            }
            // fallback: حسب createdAt
            const aTime = a.data().createdAt && a.data().createdAt.seconds ? a.data().createdAt.seconds : 0;
            const bTime = b.data().createdAt && b.data().createdAt.seconds ? b.data().createdAt.seconds : 0;
            return aTime - bTime;
        });
        // --- رسم الكروت والمجلدات الفرعية مباشرة مع دائرة تحميل للعدادات ---
        const folderCountDivs = []; // لكل مجلد: {countsDiv, doc, idx}
        folderDocs.forEach((doc, idx) => {
            const data = doc.data();
            if (currentParentId === null) {
                // كارت الكورس
                const card = document.createElement('div');
                card.className = 'course-card';
                card.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                card.style.direction = 'rtl';
                // صورة الكورس
                const img = document.createElement('img');
                img.className = 'course-card-img';
                img.src = data.courseImg && data.courseImg.trim() ? data.courseImg : 'صور/Photo.avif';
                img.style.cursor = 'pointer';
                img.onclick = (e) => {
                    e.stopPropagation();
                    if (img.src && img.src !== 'صور/Photo.avif') showImgPreview(img.src);
                };
                card.appendChild(img);
                // بادج الوقت (اختياري)
                if (data.courseDuration) {
                    const badge = document.createElement('div');
                    badge.className = 'course-card-badge';
                    badge.textContent = data.courseDuration;
                    card.appendChild(badge);
                }
                // جسم الكارت
                const body = document.createElement('div');
                body.className = 'course-card-body';
                body.style.cursor = 'pointer';
                body.onclick = () => {
                    currentPath.push({id: doc.id, name: data.name});
                    currentParentId = doc.id;
                    loadFolders();
                };
                // اسم الكورس
                const title = document.createElement('div');
                title.className = 'course-card-title';
                title.textContent = data.name || '';
                title.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                title.style.direction = 'rtl';
                body.appendChild(title);
                // وصف الكورس
                const desc = document.createElement('div');
                desc.className = 'course-card-desc';
                desc.textContent = data.courseInfo || '';
                desc.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                desc.style.direction = 'rtl';
                body.appendChild(desc);
                // --- عدادات الفيديوهات والملفات: دائرة تحميل مؤقتة ---
                const countsDiv = document.createElement('div');
                countsDiv.style.display = 'flex';
                countsDiv.style.gap = '12px';
                countsDiv.style.alignItems = 'center';
                countsDiv.style.margin = '8px 0 0 0';
                countsDiv.style.fontSize = '1.08em';
                countsDiv.innerHTML = `<span style="display:flex;align-items:center;gap:4px;">
                    <span class="mini-loader" style="width:22px;height:22px;border:3px solid #e3eaf2;border-top:3px solid #1976d2;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span>
                </span>`;
                body.appendChild(countsDiv);
                card.appendChild(body);
                // الفوتر: المحاضر والسعر
                const footer = document.createElement('div');
                footer.className = 'course-card-footer';
                // المحاضر
                const instructor = document.createElement('div');
                instructor.className = 'course-card-instructor';
                const instructorImgSrc = data.instructorImg && data.instructorImg.trim() ? data.instructorImg : 'صور/person.png';
                if (instructorImgSrc) {
                    const instructorImg = document.createElement('img');
                    instructorImg.className = 'course-card-instructor-img';
                    instructorImg.src = instructorImgSrc;
                    instructorImg.style.cursor = 'pointer';
                    instructorImg.onclick = (e) => {
                        e.stopPropagation();
                        if (instructorImg.src && instructorImg.src !== 'صور/person.png') showInstructorImgPreview(instructorImg.src);
                    };
                    instructor.appendChild(instructorImg);
                }
                const instructorName = document.createElement('span');
                instructorName.textContent = data.instructor || '';
                instructorName.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                instructorName.style.direction = 'rtl';
                instructor.appendChild(instructorName);
                footer.appendChild(instructor);
                // السعر
                const price = document.createElement('div');
                price.className = 'course-card-price';
                price.textContent = (data.coursePrice ? data.coursePrice + ' جنية' : '');
                price.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                price.style.direction = 'ltr';
                footer.appendChild(price);
                card.appendChild(footer);
                // أزرار الإجراءات
                const actions = document.createElement('div');
                actions.className = 'course-card-actions';
                // زر خصائص
                const propsBtn = document.createElement('button');
                propsBtn.textContent = 'خصائص';
                propsBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const folderDoc = await db.collection('folders').doc(doc.id).get();
                    const d = folderDoc.data() || {};
                    openModal('root-props', {
                        id: doc.id,
                        instructor: d.instructor || '',
                        instructorImg: d.instructorImg || '',
                        courseImg: d.courseImg || '',
                        courseInfo: d.courseInfo || '',
                        coursePrice: d.coursePrice || '',
                        name: d.name || ''
                    });
                };
                actions.appendChild(propsBtn);
                // زر إعادة التسمية
                const renameBtn = document.createElement('button');
                renameBtn.textContent = 'إعادة تسمية';
                renameBtn.onclick = (e) => {
                    e.stopPropagation();
                    openModal('edit-folder', {id: doc.id, name: data.name});
                };
                actions.appendChild(renameBtn);
                // زر حذف
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'حذف';
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm('هل أنت متأكد من حذف هذا المجلد وكل محتوياته؟')) {
                        await deleteFolderRecursive(doc.id);
                        loadFolders();
                    }
                };
                actions.appendChild(deleteBtn);
                card.appendChild(actions);
                foldersDiv.appendChild(card);
                folderCountDivs.push({countsDiv, doc, idx});
            } else {
                // مجلد فرعى
                const div = document.createElement('div');
                div.className = 'folder subfolder';
                div.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                div.style.direction = 'rtl';
                div.style.cursor = 'pointer';
                div.style.flexWrap = 'wrap';
                div.style.padding = '0 14px'; // تقليل البادينج الرأسي
                div.style.minHeight = 'unset'; // لا يوجد ارتفاع ثابت
                div.onclick = (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    currentPath.push({id: doc.id, name: data.name});
                    currentParentId = doc.id;
                    loadFolders();
                };

                // صف أفقي للأيقونة واسم المجلد والمعلومات
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '10px';
                row.style.flex = '1 1 0';
                row.style.minWidth = '0';

                // --- تعديل هنا: استخدم نفس الكلاس والخصائص للأيقونة ---
                const icon = document.createElement('img');
                icon.className = 'folder-icon'; // نفس الكلاس المستخدم للملف والفيديو
                icon.src = 'صور/folder.png';
                icon.alt = 'مجلد';
                // لا تضع style.width/style.height هنا، اترك التحكم للـ CSS فقط
                row.appendChild(icon);
                // --- نهاية التعديل ---

                const nameInfoWrapper = document.createElement('div');
                nameInfoWrapper.style.display = 'flex';
                nameInfoWrapper.style.flexDirection = 'column';
                nameInfoWrapper.style.flex = '1 1 0';
                nameInfoWrapper.style.minWidth = '0';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'folder-name';
                nameSpan.textContent = data.name;
                nameSpan.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                nameSpan.style.direction = 'rtl';
                nameSpan.style.minWidth = '0';
                nameSpan.style.wordBreak = 'break-word';
                nameSpan.style.flex = '1 1 0';
                nameSpan.style.maxWidth = '100%';
                nameSpan.style.overflowWrap = 'anywhere';
                nameSpan.style.fontSize = '1.13em';
                nameSpan.style.color = '#0d47a1';
                nameSpan.style.padding = '10px 0'; // padding رأسي فقط حول الاسم
                nameInfoWrapper.appendChild(nameSpan);

                if (data.folderInfo) {
                    const infoDiv = document.createElement('div');
                    infoDiv.style.color = '#444';
                    infoDiv.style.fontSize = '1.08em';
                    infoDiv.style.margin = '0';
                    infoDiv.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                    infoDiv.style.direction = 'rtl';
                    infoDiv.textContent = data.folderInfo;
                    nameInfoWrapper.appendChild(infoDiv);
                }

                // عدادات الفيديوهات والملفات: دائرة تحميل مؤقتة
                const countsDiv = document.createElement('div');
                countsDiv.style.display = 'flex';
                countsDiv.style.gap = '10px';
                countsDiv.style.alignItems = 'center';
                countsDiv.style.margin = '0 0 0 0';
                countsDiv.style.fontSize = '0.98em';
                countsDiv.innerHTML = `<span style="display:flex;align-items:center;gap:4px;">
                    <span class="mini-loader" style="width:18px;height:18px;border:3px solid #e3eaf2;border-top:3px solid #1976d2;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span>
                </span>`;
                nameInfoWrapper.appendChild(countsDiv);

                row.appendChild(nameInfoWrapper);
                div.appendChild(row);

                // Actions
                const actions = document.createElement('span');
                actions.className = 'actions';
                actions.style.display = 'flex';
                actions.style.flexWrap = 'wrap';
                actions.style.gap = '6px';
                actions.style.alignItems = 'center';
                actions.style.marginTop = '6px';
                const renameBtn = document.createElement('button');
                renameBtn.textContent = 'إعادة تسمية';
                renameBtn.onclick = (e) => {
                    e.stopPropagation();
                    openModal('edit-folder', {id: doc.id, name: data.name});
                };
                actions.appendChild(renameBtn);
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'حذف';
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm('هل أنت متأكد من حذف هذا المجلد وكل محتوياته؟')) {
                        await deleteFolderRecursive(doc.id);
                        loadFolders();
                    }
                };
                actions.appendChild(deleteBtn);
                const moveBtn = document.createElement('button');
                moveBtn.textContent = 'نقل';
                moveBtn.onclick = async (e) => {
                    e.stopPropagation();
                    showMoveModal(doc.id, async (destId) => {
                        if (destId && destId !== doc.id) {
                            await db.collection('folders').doc(doc.id).update({parentId: destId});
                            loadFolders();
                        }
                    });
                };
                actions.appendChild(moveBtn);
                div.appendChild(actions);
                foldersDiv.appendChild(div);
                folderCountDivs.push({countsDiv, doc, idx});
            }
        });

        // --- بعد رسم كل الكروت، احسب الإحصائيات وحدث كل كارت عند اكتمال الحساب ---
        folderCountDivs.forEach(async ({countsDiv, doc}) => {
            const data = doc.data();
            let youtubeApiKey = '';
            if (currentParentId === null) {
                youtubeApiKey = data.youtubeApiKey || '';
            }
            if (currentParentId !== null && !youtubeApiKey) {
                // ابحث عن الجذر في المسار الحالي
                if (Array.isArray(currentPath) && currentPath.length > 0) {
                    const rootId = currentPath[0].id;
                    if (rootId) {
                        try {
                            const rootDoc = await db.collection('folders').doc(rootId).get();
                            if (rootDoc.exists) {
                                youtubeApiKey = rootDoc.data().youtubeApiKey || '';
                            }
                        } catch (e) {}
                    }
                }
            }
            const counts = await getCountsAndDurations(doc.id, youtubeApiKey);
            let durationStr = counts.totalDuration > 0 ? ` (${formatDuration(counts.totalDuration)})` : '';
            countsDiv.innerHTML = `
                <span style="display:flex;align-items:center;gap:4px;color:#e53935;background:#ffebee;border-radius:7px;padding:2px 10px 2px 8px;">
                    <img src="صور/video.png" alt="فيديو" style="width:22px;height:22px;vertical-align:middle;">
                    <span>${counts.videos} فيديو${durationStr}</span>
                </span>
                <span style="display:flex;align-items:center;gap:4px;color:#ff6f00;background:#fffde7;border-radius:7px;padding:2px 10px 2px 8px;">
                    <img src="صور/file.png" alt="ملف" style="width:22px;height:22px;vertical-align:middle;">
                    <span>${counts.files} ملف</span>
                </span>
            `;
        });
        // Render items (videos/files)
        // --- تعديل هنا: دمج كل العناصر وترتيبهم حسب createdAt ---
        const itemsArr = [];
        itemSnap.forEach(doc => {
            itemsArr.push({ doc, data: doc.data() });
        });
        // رتب حسب createdAt (من الأقدم إلى الأحدث)
        itemsArr.sort((a, b) => {
            const aOrder = a.data.order ?? null;
            const bOrder = b.data.order ?? null;
            if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
            // fallback: حسب createdAt
            const aTime = a.data.createdAt && a.data.createdAt.seconds ? a.data.createdAt.seconds : 0;
            const bTime = b.data.createdAt && b.data.createdAt.seconds ? b.data.createdAt.seconds : 0;
            return aTime - bTime;
        });
        // اعرض العناصر بالترتيب الجديد
        for (const { doc, data } of itemsArr) {
            // اختر الكلاس حسب النوع
            let itemClass = data.type === 'video' ? 'video-item' : 'file-item';
            const div = document.createElement('div');
            div.className = itemClass;
            div.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            div.style.direction = 'rtl';
            div.style.cursor = 'pointer';
            div.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                if (data.type === 'video') {
                    if (isYouTubeUrl(data.url)) {
                        showYouTubeModal(data.url);
                    } else if (isLiveStreamUrl(data.url)) {
                        showLiveVideoModal(data.url);
                    } else {
                    }
                } else {
                    if (isGoogleDrivePdfUrl(data.url)) {
                        showGoogleDrivePdfModal(data.url);
                    }
                }
            };
            // اسم العنصر مع الأيقونة (كصورة خارج الاسم مثل المجلد)
            const nameInfoWrapper = document.createElement('div');
            nameInfoWrapper.style.display = 'flex';
            nameInfoWrapper.style.flexDirection = 'column';
            nameInfoWrapper.style.flex = '1 1 180px';

            // صورة الأيقونة (خارج الاسم)
            const icon = document.createElement('img');
            icon.className = data.type === 'video' ? 'video-icon' : 'file-icon';
            icon.src = data.type === 'video' ? 'صور/video.png' : 'صور/file.png';
            icon.alt = data.type === 'video' ? 'فيديو' : 'ملف';
            // تم نقل خصائص الحجم والعرض إلى CSS فقط

            // اسم العنصر
            const nameSpan = document.createElement('span');
            nameSpan.className = 'folder-name';
            nameSpan.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            nameSpan.style.direction = 'rtl';
            nameSpan.style.minWidth = '0';
            nameSpan.style.wordBreak = 'break-word';
            nameSpan.style.flex = '1 1 180px';
            nameSpan.style.maxWidth = '100%';
            nameSpan.style.overflowWrap = 'anywhere';
            nameSpan.style.display = 'inline-block';

            // --- إضافة: مدة الفيديو ---
let durationSpan = null;
if (data.type === 'video') {
    durationSpan = document.createElement('span');
    durationSpan.style.color = '#1976d2';
    durationSpan.style.fontSize = '0.95em';
    durationSpan.style.marginRight = '8px';
    durationSpan.style.display = 'inline-flex';
    durationSpan.style.alignItems = 'center';

    // رمز الساعة فقط بدون نص
    const clockIcon = document.createElement('span');
    clockIcon.textContent = '⏱';
    clockIcon.style.marginLeft = '2px';
    durationSpan.appendChild(clockIcon);

    // سيتم تعبئتها لاحقاً بالمدة
    const durationText = document.createElement('span');
    durationText.textContent = '';
    durationSpan.appendChild(durationText);
}

            // --- نهاية الإضافة ---

            // اسم العنصر كرابط أو سبان
            if (data.type === 'video' && isYouTubeUrl(data.url)) {
                const label = document.createElement('span');
                label.textContent = data.name;
                label.style.color = '#e53935';
                label.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                label.style.direction = 'ltr';
                label.style.cursor = 'pointer';
                label.onclick = (e) => {
                    e.stopPropagation();
                    showYouTubeModal(data.url);
                };
                nameSpan.appendChild(label);
            } else {
                const label = document.createElement('span');
                label.textContent = data.name;
                label.style.color = data.type === 'video' ? '#e53935' : '#ff6f00';
                label.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                label.style.direction = 'ltr';
                label.style.cursor = 'pointer';
                nameSpan.appendChild(label);
            }

            // --- إضافة: إلحاق مدة الفيديو بجانب الاسم ---
            if (durationSpan) {
                nameSpan.appendChild(document.createTextNode(' '));
                nameSpan.appendChild(durationSpan);

                // جلب مدة الفيديو
                if (isYouTubeUrl(data.url)) {
                    // جلب API key من الجذر
                    let youtubeApiKey = '';
                    if (Array.isArray(currentPath) && currentPath.length > 0) {
                        const rootId = currentPath[0].id;
                        if (rootId) {
                            try {
                                const rootDoc = await db.collection('folders').doc(rootId).get();
                                if (rootDoc.exists) {
                                    youtubeApiKey = rootDoc.data().youtubeApiKey || '';
                                }
                            } catch (e) {}
                        }
                    }
                    const vid = extractYouTubeId(data.url);
                    if (vid && youtubeApiKey) {
                        durationSpan.querySelector('span:last-child').textContent = '...';
                        fetchYouTubeDurations([vid], youtubeApiKey).then(durations => {
                            if (durations[vid]) {
                                durationSpan.querySelector('span:last-child').textContent = formatDuration(durations[vid]);
                            } else {
                                durationSpan.querySelector('span:last-child').textContent = '';
                            }
                        });
                    }
                } else if (isLiveStreamUrl(data.url) && /\.mp4$/i.test(data.url)) {
                    durationSpan.querySelector('span:last-child').textContent = '...';
                    getMp4Duration(data.url).then(dur => {
                        if (dur > 0) {
                            durationSpan.querySelector('span:last-child').textContent = formatDuration(dur);
                        } else {
                            durationSpan.querySelector('span:last-child').textContent = '';
                        }
                    });
                }
            }
            // --- نهاية الإضافة ---

            // صف أفقي للأيقونة والاسم
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.appendChild(icon);
            row.appendChild(nameSpan);

            nameInfoWrapper.appendChild(row);

            // --- معلومات إضافية ---
            if (data.itemInfo) {
                const infoDiv = document.createElement('div');
                infoDiv.style.color = '#444';
                infoDiv.style.fontSize = '1.08em';
                infoDiv.style.margin = '6px 0 0 0';
                infoDiv.style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
                infoDiv.style.direction = 'rtl';
                infoDiv.textContent = data.itemInfo;
                nameInfoWrapper.appendChild(infoDiv);
            }
            // --- نهاية الإضافة ---

            div.appendChild(nameInfoWrapper);

            // Actions
            const actions = document.createElement('span');
            actions.className = 'actions';
            actions.style.display = 'flex';
            actions.style.flexWrap = 'wrap';
            actions.style.gap = '6px';
            actions.style.alignItems = 'center';
            actions.style.marginTop = '6px';
            // Rename (edit name and url)
            const renameBtn = document.createElement('button');
            renameBtn.textContent = 'تعديل';
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                openModal('edit-item', {id: doc.id, name: data.name, url: data.url, type: data.type});
            };
            actions.appendChild(renameBtn);
            // Delete
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'حذف';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('هل أنت متأكد من حذف هذا العنصر؟')) {
                    await db.collection('items').doc(doc.id).delete();
                    loadFolders();
                }
            };
            actions.appendChild(deleteBtn);
            // Move
            const moveBtn = document.createElement('button');
            moveBtn.textContent = 'نقل';
            moveBtn.onclick = async (e) => {
                e.stopPropagation();
                showMoveModal(null, async (destId) => {
                    if (destId && destId !== currentParentId) {
                        await db.collection('items').doc(doc.id).update({parentId: destId});
                        loadFolders();
                    }
                });
            };
            actions.appendChild(moveBtn);
            div.appendChild(actions);
            foldersDiv.appendChild(div);
        }
    }

    // دالة للتحقق إذا كان الرابط من يوتيوب
    function isYouTubeUrl(url) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(url);
    }

    // دالة للتحقق إذا كان الرابط بث مباشر (m3u8/mpd/mp4/live)
    function isLiveStreamUrl(url) {
        return /\.(m3u8|mpd|mp4)$/i.test(url) || /live/i.test(url);
    }

    // دالة لعرض نافذة منبثقة بها فيديو يوتيوب
    function showYouTubeModal(url) {
        let videoId = null;
        // استخراج ID الفيديو من الرابط
        const ytMatch = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([A-Za-z0-9_\-]+)/);
        if (ytMatch && ytMatch[1]) {
            videoId = ytMatch[1];
        } else {
            // fallback: حاول استخراج id من أي رابط يوتيوب
            try {
                const urlObj = new URL(url);
                if (urlObj.hostname.includes('youtube.com')) {
                    videoId = urlObj.searchParams.get('v');
                }
            } catch (e) {}
        }
        // --- تعديل هنا: لا تفتح نافذة خارجية أبداً، إذا لم يوجد ID لا تفعل شيء أو أعطِ تنبيه ---
        if (!videoId) {
            alert('تعذر استخراج معرف فيديو يوتيوب من الرابط. يرجى التأكد من صحة الرابط.');
            return;
        }
        // استخدم مشغل Plyr الجديد
        openVideoPlayer(videoId);
    }

    // دالة لعرض نافذة منبثقة بها بث مباشر (مشغل فيديو HTML5)
    function showLiveVideoModal(url) {
        // إنشاء أو إظهار نافذة الفيديو
        let modal = document.getElementById('live-video-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'live-video-modal';
            modal.style.cssText = `
                display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background:#000b;z-index:5000;justify-content:center;align-items:center;
            `;
            modal.innerHTML = `
                <div style="position:relative;max-width:96vw;max-height:80vh;width:100%;display:flex;flex-direction:column;align-items:center;">
                    <span id="exit-live-video-button" style="position:absolute;top:18px;left:24px;font-size:2em;color:#fff;cursor:pointer;z-index:5010;background:#1976d2cc;border-radius:50%;padding:2px 12px;">خروج</span>
                    <video id="live-player" width="800" controls controlsList="nodownload" disablePictureInPicture style="max-width:90vw;max-height:70vh;border-radius:12px;background:#222;">
                        <source src="" type="video/mp4" />
                        المتصفح لا يدعم تشغيل الفيديو.
                    </video>
                </div>
            `;
            document.body.appendChild(modal);
            // زر الخروج
            modal.querySelector('#exit-live-video-button').onclick = function() {
                closeLiveVideoModal();
            };
            // منع قائمة السياق على كامل النافذة
            modal.addEventListener('contextmenu', function(e) { e.preventDefault(); });
            // منع الضغط المطول والتسريع
            const video = modal.querySelector('#live-player');
            let longPressTimer = null;
            video.addEventListener('touchstart', function(e) {
                longPressTimer = setTimeout(() => { video.playbackRate = 2; }, 500);
            });
            video.addEventListener('touchend', function(e) {
                clearTimeout(longPressTimer);
                video.playbackRate = 1;
            });
            video.addEventListener('touchmove', function(e) {
                clearTimeout(longPressTimer);
                video.playbackRate = 1;
            });
        }
        // ضبط الرابط
        const video = modal.querySelector('#live-player');
        video.src = url;
        video.load();
        modal.style.display = 'flex';
    }

    // دالة لإغلاق نافذة البث المباشر
    function closeLiveVideoModal() {
        const modal = document.getElementById('live-video-modal');
        if (modal) {
            const video = modal.querySelector('#live-player');
            if (video) {
                video.pause();
                video.src = '';
            }
            modal.style.display = 'none';
        }
    }

    // دالة للتحقق إذا كان الرابط ملف PDF من Google Drive
    function isGoogleDrivePdfUrl(url) {
        // يتحقق من وجود /file/d/{id}/view في الرابط وأنه ينتهي بـ .pdf أو لا يوجد امتداد (غالباً روابط PDF من درايف)
        return /^https:\/\/drive\.google\.com\/file\/d\/[^/]+\/view/.test(url);
    }

    // دالة لعرض نافذة منبثقة بها PDF Google Drive
    function showGoogleDrivePdfModal(url) {
        // استخراج ID الملف من الرابط
        const match = url.match(/\/file\/d\/([^/]+)\//);
        if (!match) {
            window.open(url, '_blank');
            return;
        }
        const fileId = match[1];
        // رابط التضمين
        const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;

        // إنشاء أو إظهار نافذة PDF
        let modal = document.getElementById('pdf-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pdf-modal';
            modal.style.cssText = `
                display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background:#000b;z-index:6000;justify-content:center;align-items:center;
            `;
            modal.innerHTML = `
                <div style="position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;">
                    <span id="exit-pdf-button" style="position:absolute;top:18px;left:24px;font-size:2em;color:#fff;cursor:pointer;z-index:6010;background:#1976d2cc;border-radius:50%;padding:0 12px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:1.6em;line-height:1;">&times;</span>
                    <iframe id="pdf-iframe" src="" style="width:100vw;height:100vh;border-radius:0;border:none;background:#fff;box-shadow:none;" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"></iframe>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#exit-pdf-button').onclick = function() {
                closeGoogleDrivePdfModal();
            };
        }
        const iframe = modal.querySelector('#pdf-iframe');
        iframe.src = embedUrl;
        modal.style.display = 'flex';
    }

    function closeGoogleDrivePdfModal() {
        const modal = document.getElementById('pdf-modal');
        if (modal) {
            const iframe = modal.querySelector('#pdf-iframe');
            if (iframe) iframe.src = '';
            modal.style.display = 'none';
        }
    }

    // Helper: Get YouTube video ID from URL
    function extractYouTubeId(url) {
        const ytMatch = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([A-Za-z0-9_\-]+)/);
        if (ytMatch && ytMatch[1]) return ytMatch[1];
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                return urlObj.searchParams.get('v');
            }
        } catch (e) {}
        return null;
    }

    // Helper: Fetch YouTube video durations (returns {id: durationSeconds})
    async function fetchYouTubeDurations(ids, apiKey) {
        if (!apiKey || !ids.length) return {};
        const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${apiKey}`;
        try {
            const resp = await fetch(url);
            const data = await resp.json();
            const result = {};
            if (data.items) {
                for (const item of data.items) {
                    // ISO 8601 duration to seconds
                    const iso = item.contentDetails.duration;
                    result[item.id] = isoDurationToSeconds(iso);
                }
            }
            return result;
        } catch (e) {
            return {};
        }
    }

    // Helper: Convert ISO 8601 duration to seconds
    function isoDurationToSeconds(iso) {
        // Example: PT1H2M10S
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        const h = parseInt(match[1] || '0', 10);
        const m = parseInt(match[2] || '0', 10);
        const s = parseInt(match[3] || '0', 10);
        return h * 3600 + m * 60 + s;
    }

    // Helper: Format seconds to H:MM:SS or MM:SS
    function formatDuration(sec) {
        sec = Math.round(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Helper: Get MP4 duration using HTML5 video
    function getMp4Duration(url) {
        return new Promise(resolve => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = url;
            video.onloadedmetadata = function() {
                resolve(video.duration || 0);
            };
            video.onerror = function() {
                resolve(0);
            };
        });
    }

    // لا حاجة لتعديل هنا، خصائص العرض ستأتي من CSS فقط

    // نافذة منبثقة لاختيار مجلد الوجهة للنقل مع دائرة تحميل وشريط بحث
function showMoveModal(excludeId, callback) {
    let allFolders = [];
    let filteredFolders = [];
    let modal = null;
    let listDiv = null;
    let searchInput = null;
    let loaderDiv = null;

    // جلب كل مجلدات المستخدم الحالي
    async function fetchFolders(parentId, prefix) {
        const snap = await db.collection('folders')
            .where('parentId', '==', parentId)
            .where('userId', '==', currentUserId)
            .get();
        let arr = [];
        for (const doc of snap.docs) {
            if (doc.id === excludeId) continue;
            arr.push({id: doc.id, name: prefix + doc.data().name});
            const subs = await fetchFolders(doc.id, prefix + doc.data().name + '/');
            arr = arr.concat(subs);
        }
        return arr;
    }

    // تعبئة القائمة حسب البحث
    function renderList() {
        if (!listDiv) return;
        listDiv.innerHTML = '';
        let arr = filteredFolders;
        if (arr.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center;color:#e53935;font-size:1.08em;">لا يوجد نتائج</div>';
            return;
        }
        arr.forEach((f) => {
            const btn = document.createElement('button');
            btn.textContent = f.name;
            btn.style.cssText = `
                display:block;width:100%;margin-bottom:8px;background:linear-gradient(90deg,#1976d2 60%,#2196f3 100%);
                color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:1.08em;font-weight:bold;cursor:pointer;
                font-family:'Cairo','Tajawal','Segoe UI',Arial,sans-serif;direction:rtl;
            `;
            btn.onclick = function() {
                closeMoveModal();
                callback(f.id);
            };
            listDiv.appendChild(btn);
        });
    }

    // إنشاء أو إظهار النافذة
    async function openModal() {
        // أنشئ النافذة إذا لم تكن موجودة
        modal = document.getElementById('move-modal-bg');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'move-modal-bg';
            modal.style.cssText = `
                display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background:#0007;z-index:3000;justify-content:center;align-items:center;
            `;
            modal.innerHTML = `
                <div id="move-modal" style="background:#fff;padding:28px 22px 18px 22px;border-radius:16px;max-width:370px;box-shadow:0 4px 24px #1976d222;min-width:320px;">
                    <h3 style="text-align:center;color:#1976d2;font-size:1.15em;font-weight:bold;margin-top:0;">اختر المجلد الوجهة</h3>
                    <div id="move-modal-search-row" style="margin-bottom:10px;">
                        <input id="move-modal-search" type="text" placeholder="بحث..." style="width:100%;padding:7px 12px;font-size:1.08em;border-radius:8px;border:1.5px solid #e3eaf2;margin-bottom:4px;font-family:'Cairo','Tajawal','Segoe UI',Arial,sans-serif;direction:rtl;">
                    </div>
                    <div id="move-modal-loader" style="display:flex;justify-content:center;align-items:center;margin-bottom:18px;">
                        <span class="mini-loader" style="width:32px;height:32px;border:4px solid #e3eaf2;border-top:4px solid #1976d2;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span>
                    </div>
                    <div id="move-modal-list" style="margin-bottom:18px;max-height:260px;overflow-y:auto;"></div>
                    <div style="text-align:center;">
                        <button id="move-modal-cancel-btn" style="padding:6px 18px;">إلغاء</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#move-modal-cancel-btn').onclick = function() {
                closeMoveModal();
            };
        }
        modal.style.display = 'flex';
        listDiv = modal.querySelector('#move-modal-list');
        searchInput = modal.querySelector('#move-modal-search');
        loaderDiv = modal.querySelector('#move-modal-loader');
        // أظهر دائرة التحميل
        loaderDiv.style.display = 'flex';
        listDiv.style.display = 'none';

        // جلب المجلدات
        allFolders = await fetchFolders(null, '');
        filteredFolders = allFolders;
        // أخفِ دائرة التحميل وأظهر القائمة
        loaderDiv.style.display = 'none';
        listDiv.style.display = 'block';
        renderList();

        // البحث
        searchInput.value = '';
        searchInput.oninput = function() {
            const val = searchInput.value.trim();
            if (!val) {
                filteredFolders = allFolders;
            } else {
                filteredFolders = allFolders.filter(f => f.name.includes(val));
            }
            renderList();
        };
        searchInput.focus();
    }
    openModal();
}
function closeMoveModal() {
    const modal = document.getElementById('move-modal-bg');
    if (modal) modal.style.display = 'none';
}

// نافذة الترتيب اليدوي
function showSortModal() {
    getCurrentOrder().then(arr => {
        let modal = document.getElementById('sort-modal-bg');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sort-modal-bg';
            modal.style.cssText = `
                display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background:#0007;z-index:3500;justify-content:center;align-items:center;
            `;
            modal.innerHTML = `
                <div id="sort-modal" style="background:#fff;padding:28px 22px 18px 22px;border-radius:16px;max-width:370px;box-shadow:0 4px 24px #1976d222;min-width:320px;">
                    <h3 style="text-align:center;color:#1976d2;font-size:1.15em;font-weight:bold;margin-top:0;">ترتيب العناصر</h3>
                    <div id="sort-modal-list" style="margin-bottom:18px;max-height:320px;overflow-y:auto;"></div>
                    <div style="text-align:center;">
                        <button id="sort-modal-save-btn" style="padding:6px 18px;">حفظ</button>
                        <button id="sort-modal-cancel-btn" style="padding:6px 18px;">إلغاء</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#sort-modal-cancel-btn').onclick = function() {
                closeSortModal();
            };
        }
        modal.style.display = 'flex';

        // بناء القائمة القابلة للسحب
        const listDiv = modal.querySelector('#sort-modal-list');

        // دالة لإعادة بناء القائمة بعد كل سحب
        function renderList() {
            listDiv.innerHTML = '';
            arr.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'sort-row';
                row.draggable = true;
                row.style.cssText = `
                    display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:6px;
                    background:#f7fafd;border-radius:8px;cursor:grab;font-size:1.08em;
                    font-family:'Cairo','Tajawal','Segoe UI',Arial,sans-serif;direction:rtl;
                    border:1.5px solid #e3eaf2;
                `;
                row.dataset.idx = idx;
                row.innerHTML = `
                    <span style="font-size:1.2em;">&#9776;</span>
                    <span style="color:${item.type==='folder'?'#1976d2':item.type==='video'?'#e53935':'#ff6f00'};">
                        ${item.type==='folder'?'[مجلد]':item.type==='video'?'[فيديو]':'[ملف]'}
                    </span>
                    <span style="flex:1;">${item.name}</span>
                `;
                listDiv.appendChild(row);
            });

            // منطق السحب والإفلات المتعدد
            let dragIdx = null;
            listDiv.querySelectorAll('.sort-row').forEach(row => {
                row.addEventListener('dragstart', function(e) {
                    dragIdx = Number(row.dataset.idx);
                    row.style.opacity = '0.5';
                });
                row.addEventListener('dragend', function(e) {
                    row.style.opacity = '1';
                });
                row.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    row.style.background = '#e3f0ff';
                });
                row.addEventListener('dragleave', function(e) {
                    row.style.background = '#f7fafd';
                });
                row.addEventListener('drop', function(e) {
                    e.preventDefault();
                    row.style.background = '#f7fafd';
                    const dropIdx = Number(row.dataset.idx);
                    if (dragIdx === null || dragIdx === dropIdx) return;
                    // نقل العنصر من dragIdx إلى dropIdx
                    const moved = arr.splice(dragIdx, 1)[0];
                    arr.splice(dropIdx, 0, moved);
                    renderList(); // إعادة بناء القائمة بعد كل سحب
                });
            });
        }

        renderList();

        // زر الحفظ
        modal.querySelector('#sort-modal-save-btn').onclick = async function() {
            for (let i = 0; i < arr.length; i++) {
                const item = arr[i];
                if (item.type === 'folder') {
                    await db.collection('folders').doc(item.id).update({order: i});
                } else {
                    await db.collection('items').doc(item.id).update({order: i});
                }
            }
            closeSortModal();
            loadFolders();
        };
    });
}

// زر الترتيب
document.getElementById('sort-btn').onclick = showSortModal;

// تعديل ترتيب العرض ليأخذ order إذا وجد
// في loadFolders، عند ترتيب folderDocs و itemsArr:
folderDocs.sort((a, b) => {
    const aOrder = a.data().order ?? null;
    const bOrder = b.data().order ?? null;
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    // fallback: حسب createdAt
    const aTime = a.data().createdAt && a.data().createdAt.seconds ? a.data().createdAt.seconds : 0;
    const bTime = b.data().createdAt && b.data().createdAt.seconds ? b.data().createdAt.seconds : 0;
    return aTime - bTime;
});
itemsArr.sort((a, b) => {
    const aOrder = a.data.order ?? null;
    const bOrder = b.data.order ?? null;
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    // fallback: حسب createdAt
    const aTime = a.data.createdAt && a.data.createdAt.seconds ? a.data.createdAt.seconds : 0;
    const bTime = b.data.createdAt && b.data.createdAt.seconds ? b.data.createdAt.seconds : 0;
    return aTime - bTime;
});

// دالة تعيد ترتيب العناصر كما هو ظاهر حالياً
function getCurrentOrder() {
    // جلب المجلدات والعناصر بنفس ترتيب العرض الحالي
    let arr = [];
    // نفس ترتيب folderDocs و itemsArr في loadFolders
    let folderQuery = db.collection('folders')
        .where('parentId', '==', currentParentId)
        .where('userId', '==', currentUserId);
    let itemQuery = db.collection('items')
        .where('parentId', '==', currentParentId)
        .where('userId', '==', currentUserId);

    return Promise.all([folderQuery.get(), itemQuery.get()]).then(([folderSnap, itemSnap]) => {
        let folderDocs = folderSnap.docs;
        folderDocs.sort((a, b) => {
            const aOrder = a.data().order ?? null;
            const bOrder = b.data().order ?? null;
            if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
            const aTime = a.data().createdAt && a.data().createdAt.seconds ? a.data().createdAt.seconds : 0;
            const bTime = b.data().createdAt && b.data().createdAt.seconds ? b.data().createdAt.seconds : 0;
            return aTime - bTime;
        });
        folderDocs.forEach(doc => {
            arr.push({
                id: doc.id,
                type: 'folder',
                name: doc.data().name,
                order: doc.data().order ?? 0
            });
        });
        let itemsArr = [];
        itemSnap.forEach(doc => {
            itemsArr.push({ doc, data: doc.data() });
        });
        itemsArr.sort((a, b) => {
            const aOrder = a.data.order ?? null;
            const bOrder = b.data.order ?? null;
            if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
            const aTime = a.data.createdAt && a.data.createdAt.seconds ? a.data.createdAt.seconds : 0;
            const bTime = b.data.createdAt && b.data.createdAt.seconds ? b.data.createdAt.seconds : 0;
            return aTime - bTime;
        });
        itemsArr.forEach(({doc, data}) => {
            arr.push({
                id: doc.id,
                type: data.type,
                name: data.name,
                order: data.order ?? 0
            });
        });
        return arr;
    });
}

// نافذة الترتيب اليدوي (تستخدم ترتيب العرض الحالي)
function showSortModal() {
    getCurrentOrder().then(arr => {
        let modal = document.getElementById('sort-modal-bg');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sort-modal-bg';
            modal.style.cssText = `
                display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background:#0007;z-index:3500;justify-content:center;align-items:center;
            `;
            modal.innerHTML = `
                <div id="sort-modal" style="background:#fff;padding:28px 22px 18px 22px;border-radius:16px;max-width:370px;box-shadow:0 4px 24px #1976d222;min-width:320px;">
                    <h3 style="text-align:center;color:#1976d2;font-size:1.15em;font-weight:bold;margin-top:0;">ترتيب العناصر</h3>
                    <div id="sort-modal-list" style="margin-bottom:18px;max-height:320px;overflow-y:auto;"></div>
                    <div style="text-align:center;">
                        <button id="sort-modal-save-btn" style="padding:6px 18px;">حفظ</button>
                        <button id="sort-modal-cancel-btn" style="padding:6px 18px;">إلغاء</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#sort-modal-cancel-btn').onclick = function() {
                closeSortModal();
            };
        }
        modal.style.display = 'flex';

        // بناء القائمة القابلة للسحب
        const listDiv = modal.querySelector('#sort-modal-list');

        // دالة لإعادة بناء القائمة بعد كل سحب
        function renderList() {
            listDiv.innerHTML = '';
            arr.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'sort-row';
                row.draggable = true;
                row.style.cssText = `
                    display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:6px;
                    background:#f7fafd;border-radius:8px;cursor:grab;font-size:1.08em;
                    font-family:'Cairo','Tajawal','Segoe UI',Arial,sans-serif;direction:rtl;
                    border:1.5px solid #e3eaf2;
                `;
                row.dataset.idx = idx;
                row.innerHTML = `
                    <span style="font-size:1.2em;">&#9776;</span>
                    <span style="color:${item.type==='folder'?'#1976d2':item.type==='video'?'#e53935':'#ff6f00'};">
                        ${item.type==='folder'?'[مجلد]':item.type==='video'?'[فيديو]':'[ملف]'}
                    </span>
                    <span style="flex:1;">${item.name}</span>
                `;
                listDiv.appendChild(row);
            });

            // منطق السحب والإفلات المتعدد
            let dragIdx = null;
            listDiv.querySelectorAll('.sort-row').forEach(row => {
                row.addEventListener('dragstart', function(e) {
                    dragIdx = Number(row.dataset.idx);
                    row.style.opacity = '0.5';
                });
                row.addEventListener('dragend', function(e) {
                    row.style.opacity = '1';
                });
                row.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    row.style.background = '#e3f0ff';
                });
                row.addEventListener('dragleave', function(e) {
                    row.style.background = '#f7fafd';
                });
                row.addEventListener('drop', function(e) {
                    e.preventDefault();
                    row.style.background = '#f7fafd';
                    const dropIdx = Number(row.dataset.idx);
                    if (dragIdx === null || dragIdx === dropIdx) return;
                    // نقل العنصر من dragIdx إلى dropIdx
                    const moved = arr.splice(dragIdx, 1)[0];
                    arr.splice(dropIdx, 0, moved);
                    renderList(); // إعادة بناء القائمة بعد كل سحب
                });
            });
        }

        renderList();

        // زر الحفظ
        modal.querySelector('#sort-modal-save-btn').onclick = async function() {
            for (let i = 0; i < arr.length; i++) {
                const item = arr[i];
                if (item.type === 'folder') {
                    await db.collection('folders').doc(item.id).update({order: i});
                } else {
                    await db.collection('items').doc(item.id).update({order: i});
                }
            }
            closeSortModal();
            loadFolders();
        };
    });
}

function closeSortModal() {
    const modal = document.getElementById('sort-modal-bg');
    if (modal) modal.style.display = 'none';
}

//# sourceMappingURL=file-manager.js.map