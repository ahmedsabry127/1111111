// Modal logic
    let modalMode = null; // 'add-folder', 'add-video', 'add-file', 'edit-item', 'edit-folder', 'root-props'
    let modalEditId = null; // for edit
    let modalRootPropsData = null; // بيانات خصائص الجذر

    function openModal(mode, data = {}) {
        modalMode = mode;
        modalEditId = data.id || null;
        // تعديل العنوان فقط إذا كنا في الجذر ونمط الإضافة مجلد
        let modalTitle = '';
        if (mode === 'add-folder' && currentParentId === null) {
            modalTitle = 'اضافة كورس جديد';
        } else {
            modalTitle =
                mode === 'add-folder' ? 'إضافة مجلد جديد' :
                mode === 'add-video' ? 'إضافة فيديو' :
                mode === 'add-file' ? 'إضافة ملف' :
                mode === 'edit-item' ? 'تعديل عنصر' :
                mode === 'edit-folder' ? 'تعديل مجلد' :
                mode === 'root-props' ? 'خصائص الكورس' : '';
        }
        document.getElementById('modal-title').textContent = modalTitle;
        document.getElementById('modal-name').value = data.name || '';
        document.getElementById('modal-url').value = data.url || '';
        // إظهار خانة الرابط فقط للفيديو/الملف
        document.getElementById('modal-url-row').style.display =
            (mode === 'add-video' || mode === 'add-file' || mode === 'edit-item') ? 'block' : 'none';
        // خصائص الجذر
        document.getElementById('modal-root-props').style.display = (mode === 'root-props') ? 'block' : 'none';
        // --- إضافة: إظهار/إخفاء حقل معلومات عن المجلد ---
        const folderInfoRow = document.getElementById('modal-folder-info-row');
        if (
            (mode === 'add-folder' && currentParentId !== null) ||
            (mode === 'edit-folder' && currentParentId !== null)
        ) {
            folderInfoRow.style.display = '';
            document.getElementById('modal-folder-info').value = data.folderInfo || '';
        } else {
            folderInfoRow.style.display = 'none';
            document.getElementById('modal-folder-info').value = '';
        }
        // --- نهاية الإضافة ---

        // --- إضافة: إظهار/إخفاء حقل معلومات عن الفيديو/الملف ---
        const itemInfoRow = document.getElementById('modal-item-info-row');
        if (
            (mode === 'add-video' || mode === 'add-file' || mode === 'edit-item')
        ) {
            itemInfoRow.style.display = '';
            document.getElementById('modal-item-info').value = data.itemInfo || '';
            // تغيير التسمية حسب النوع
            document.getElementById('modal-item-info-label').textContent =
                (mode === 'add-video' || (mode === 'edit-item' && data.type === 'video')) ? 'معلومات عن الفيديو:' : 'معلومات عن الملف:';
        } else {
            itemInfoRow.style.display = 'none';
            document.getElementById('modal-item-info').value = '';
        }
        // --- نهاية الإضافة ---

        if (mode === 'root-props') {
            document.getElementById('modal-name').parentElement.style.display = 'none';
            document.getElementById('modal-url-row').style.display = 'none';
            document.getElementById('modal-name').removeAttribute('required');
            // تعبئة الحقول من البيانات
            document.getElementById('modal-instructor').value = data.instructor || '';
            document.getElementById('modal-instructor-img').value = data.instructorImg || '';
            document.getElementById('modal-course-img').value = data.courseImg || '';
            document.getElementById('modal-course-info').value = data.courseInfo || '';
            document.getElementById('modal-course-price').value = data.coursePrice || '';
            // إضافة: تعبئة حقل API key you tube
            document.getElementById('modal-youtube-api-key').value = data.youtubeApiKey || '';
            modalRootPropsData = data;
        } else {
            document.getElementById('modal-name').parentElement.style.display = '';
            // إعادة required للاسم
            document.getElementById('modal-name').setAttribute('required', 'required');
            modalRootPropsData = null;
        }
        document.getElementById('modal-bg').style.display = 'block';
        setTimeout(() => {
            if (mode === 'root-props') {
                document.getElementById('modal-instructor').focus();
            } else {
                document.getElementById('modal-name').focus();
            }
        }, 100);

        document.getElementById('modal-title').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
        document.getElementById('modal-title').style.direction = 'rtl';
        document.getElementById('modal-name').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
        document.getElementById('modal-name').style.direction = 'rtl';
        document.getElementById('modal-url').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
        document.getElementById('modal-url').style.direction = 'ltr';
        if (mode === 'root-props') {
            document.getElementById('modal-instructor').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            document.getElementById('modal-instructor').style.direction = 'rtl';
            document.getElementById('modal-instructor-img').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            document.getElementById('modal-instructor-img').style.direction = 'ltr';
            document.getElementById('modal-course-img').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            document.getElementById('modal-course-img').style.direction = 'ltr';
            document.getElementById('modal-course-info').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            document.getElementById('modal-course-info').style.direction = 'rtl';
            document.getElementById('modal-course-price').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
            document.getElementById('modal-course-price').style.direction = 'ltr';
        }
        // إظهار زر رفع الفيديو أو رفع الملف حسب النمط والنوع
        let showVideoBtn = false;
        let showFileBtn = false;
        if (mode === 'add-video') {
            showVideoBtn = true;
        } else if (mode === 'add-file') {
            showFileBtn = true;
        } else if (mode === 'edit-item') {
            if (data.type === 'video') {
                showVideoBtn = true;
            } else if (data.type === 'file') {
                showFileBtn = true;
            }
        }
        document.getElementById('upload-video-btn-row').style.display = showVideoBtn ? 'block' : 'none';
        document.getElementById('upload-file-btn-row').style.display = showFileBtn ? 'block' : 'none';
    }
    function closeModal() {
        document.getElementById('modal-bg').style.display = 'none';
        modalMode = null;
        modalEditId = null;
        modalRootPropsData = null;
    }

    document.getElementById('modal-form').onsubmit = async function(e) {
        e.preventDefault();
        const name = document.getElementById('modal-name').value.trim();
        const url = document.getElementById('modal-url').value.trim();
        // تعديل شرط التحقق ليعمل فقط إذا لم تكن نافذة خصائص الجذر
        if (modalMode !== 'root-props' && !name) return alert('يرجى إدخال الاسم');
        if ((modalMode === 'add-video' || modalMode === 'add-file' || modalMode === 'edit-item') && !url)
            return alert('يرجى إدخال الرابط');
        if (!currentUserId) return alert('حدث خطأ في هوية المستخدم');
        // --- إضافة: جلب معلومات عن المجلد ---
        const folderInfo = document.getElementById('modal-folder-info').value.trim();
        // --- نهاية الإضافة ---
        // --- إضافة: جلب معلومات عن الفيديو/الملف ---
        const itemInfo = document.getElementById('modal-item-info').value.trim();
        // --- نهاية الإضافة ---
        if (modalMode === 'add-folder') {
            let folderData = {
                name,
                parentId: currentParentId,
                userId: currentUserId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            // --- إضافة: حفظ معلومات عن المجلد فقط للمجلدات الفرعية ---
            if (currentParentId !== null && folderInfo) {
                folderData.folderInfo = folderInfo;
            }
            // --- نهاية الإضافة ---
            await db.collection('folders').add(folderData);
        } else if (modalMode === 'add-video') {
            await db.collection('items').add({
                name,
                url,
                type: 'video',
                parentId: currentParentId,
                userId: currentUserId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                // --- إضافة: حفظ معلومات عن الفيديو ---
                itemInfo: itemInfo || ''
                // --- نهاية الإضافة ---
            });
        } else if (modalMode === 'add-file') {
            await db.collection('items').add({
                name,
                url,
                type: 'file',
                parentId: currentParentId,
                userId: currentUserId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                // --- إضافة: حفظ معلومات عن الملف ---
                itemInfo: itemInfo || ''
                // --- نهاية الإضافة ---
            });
        } else if (modalMode === 'edit-item' && modalEditId) {
            await db.collection('items').doc(modalEditId).update({
                name,
                url,
                // --- إضافة: تحديث معلومات عن الفيديو/الملف ---
                itemInfo: itemInfo || ''
                // --- نهاية الإضافة ---
            });
        } else if (modalMode === 'edit-folder' && modalEditId) {
            let updateData = { name };
            // --- إضافة: حفظ معلومات عن المجلد فقط للمجلدات الفرعية ---
            if (currentParentId !== null) {
                updateData.folderInfo = folderInfo;
            }
            // --- نهاية الإضافة ---
            await db.collection('folders').doc(modalEditId).update(updateData);
        } else if (modalMode === 'root-props' && modalEditId) {
            // حفظ خصائص الجذر
            const instructor = document.getElementById('modal-instructor').value.trim();
            const instructorImg = document.getElementById('modal-instructor-img').value.trim();
            const courseImg = document.getElementById('modal-course-img').value.trim();
            const courseInfo = document.getElementById('modal-course-info').value.trim();
            const coursePrice = document.getElementById('modal-course-price').value.trim();
            // إضافة: جلب قيمة API key you tube
            const youtubeApiKey = document.getElementById('modal-youtube-api-key').value.trim();
            await db.collection('folders').doc(modalEditId).update({
                instructor, instructorImg, courseImg, courseInfo, coursePrice,
                youtubeApiKey // إضافة الحقل الجديد
            });
            closeModal();
            loadFolders();
            return;
        }
        closeModal();
        loadFolders();
    };

    // زر مجلد جديد
    document.getElementById('new-folder-btn').onclick = () => openModal('add-folder');
    // زر إضافة فيديو
    document.getElementById('add-video-btn').onclick = () => {
        if (currentParentId === null) {
            alert('لا يمكن إضافة فيديو في الجذر. يجب الدخول إلى مجلد أولاً.');
            return;
        }
        openModal('add-video');
    };
    // زر إضافة ملف
    document.getElementById('add-file-btn').onclick = () => {
        if (currentParentId === null) {
            alert('لا يمكن إضافة ملف في الجذر. يجب الدخول إلى مجلد أولاً.');
            return;
        }
        openModal('add-file');
    };

    // Add image preview on click for modal image fields
document.addEventListener('DOMContentLoaded', function() {
    const instructorImgInput = document.getElementById('modal-instructor-img');
    if (instructorImgInput) {
        instructorImgInput.addEventListener('click', function() {
            // لا تفتح المعاينة إذا كان المودال فى وضع خصائص الجذر
            if (modalMode === 'root-props') return;
            if (this.value && this.value.trim()) {
                showInstructorImgPreview(this.value.trim());
            }
        });
    }
    const courseImgInput = document.getElementById('modal-course-img');
    if (courseImgInput) {
        courseImgInput.addEventListener('click', function() {
            // لا تفتح المعاينة إذا كان المودال فى وضع خصائص الجذر
            if (modalMode === 'root-props') return;
            if (this.value && this.value.trim()) {
                showImgPreview(this.value.trim());
            }
        });
    }
});

    // عند النقل، لا تظهر إلا مجلدات المستخدم الحالي
    async function selectDestinationFolder(excludeId) {
        let allFolders = [];
        async function fetchFolders(parentId, prefix) {
            const snap = await db.collection('folders')
                .where('parentId', '==', parentId)
                .where('userId', '==', currentUserId)
                .get();
            for (const doc of snap.docs) {
                if (doc.id === excludeId) continue;
                allFolders.push({id: doc.id, name: prefix + doc.data().name});
                await fetchFolders(doc.id, prefix + doc.data().name + '/');
            }
        }
        await fetchFolders(null, '');
        if (allFolders.length === 0) return null;
        let list = allFolders.map((f, i) => `${i+1}: ${f.name}`).join('\n');
        let idx = prompt('اختر رقم المجلد الوجهة:\n' + list);
        let num = parseInt(idx);
        if (!isNaN(num) && num >= 1 && num <= allFolders.length) {
            return allFolders[num-1].id;
        }
        return null;
    }

    // عند حذف مجلد بشكل متكرر، احذف فقط مجلدات وعناصر المستخدم الحالي
    async function deleteFolderRecursive(folderId) {
        // Delete subfolders first
        const subs = await db.collection('folders')
            .where('parentId', '==', folderId)
            .where('userId', '==', currentUserId)
            .get();
        for (const doc of subs.docs) {
            await deleteFolderRecursive(doc.id);
        }
        // Delete items in this folder
        const items = await db.collection('items')
            .where('parentId', '==', folderId)
            .where('userId', '==', currentUserId)
            .get();
        for (const item of items.docs) {
            await db.collection('items').doc(item.id).delete();
        }
        // Delete this folder
        await db.collection('folders').doc(folderId).delete();
    }

    // Initial load
    loadFolders();

// إخفاء أزرار إضافة فيديو/ملف في الجذر
function updateAddButtonsVisibility() {
    const addVideoBtn = document.getElementById('add-video-btn');
    const addFileBtn = document.getElementById('add-file-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    if (currentParentId === null) {
        addVideoBtn.style.display = 'none';
        addFileBtn.style.display = 'none';
        // تغيير نص الزر في الجذر
        newFolderBtn.textContent = 'اضافة كورس جديد';
        // اجعله أحمر
        newFolderBtn.style.background = 'linear-gradient(90deg, #e53935 60%, #ff5252 100%)';
        newFolderBtn.style.color = '#fff';
    } else {
        addVideoBtn.style.display = '';
        addFileBtn.style.display = '';
        // إعادة النص الافتراضي خارج الجذر
        newFolderBtn.textContent = 'اضافة مجلد';
        // إعادة اللون الافتراضي
        newFolderBtn.style.background = '';
        newFolderBtn.style.color = '';
    }
}

// استدعاء الدالة بعد كل تحميل مجلدات
const originalLoadFolders = loadFolders;
loadFolders = async function() {
    await originalLoadFolders();
    updateAddButtonsVisibility();
};