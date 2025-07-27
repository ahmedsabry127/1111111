// Firebase config
    const firebaseConfig = {
      apiKey: "AIzaSyDF0ZN5SY_r4CCaXT06qK75BdEMDudR9y8",
      authDomain: "project-2698220189460482777.firebaseapp.com",
      projectId: "project-2698220189460482777",
      storageBucket: "project-2698220189460482777.firebasestorage.app",
      messagingSenderId: "788721239859",
      appId: "1:788721239859:web:795314fc01c8a476cb6046"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    // إظهار واجهة auth أو الملفات حسب حالة المستخدم
    function showAuth(show) {
        document.getElementById('auth-container').style.display = show ? 'block' : 'none';
        document.getElementById('container').style.display = show ? 'none' : 'block';
        document.getElementById('logout-btn').style.display = show ? 'none' : 'inline-block';
        document.getElementById('auth-container').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
        document.getElementById('auth-container').style.direction = 'rtl';
        document.getElementById('container').style.fontFamily = "'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif";
        document.getElementById('container').style.direction = 'rtl';
    }

    // تبديل بين تسجيل الدخول والتسجيل
    document.getElementById('show-login-btn').onclick = function() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('auth-error').textContent = '';
    };
    document.getElementById('show-register-btn').onclick = function() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('auth-error').textContent = '';
    };
    // افتراضياً إظهار تسجيل الدخول
    document.getElementById('show-login-btn').click();

    // تسجيل جديد
    document.getElementById('register-form').onsubmit = async function(e) {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        document.getElementById('auth-error').textContent = '';
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await cred.user.updateProfile({displayName: name});
            // حفظ الاسم في قاعدة البيانات (اختياري)
            await db.collection('users').doc(cred.user.uid).set({name, email});
        } catch (err) {
            document.getElementById('auth-error').textContent = err.message;
            return;
        }
    };

    // تسجيل الدخول
    document.getElementById('login-form').onsubmit = async function(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        document.getElementById('auth-error').textContent = '';
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            document.getElementById('auth-error').textContent = err.message;
            return;
        }
    };

    // تسجيل الخروج
    document.getElementById('logout-btn').onclick = function() {
        auth.signOut();
    };

    // Folder navigation state
    let currentPath = []; // Array of {id, name}
    let currentParentId = null; // null = root
    let currentUserId = null;

    // مراقبة حالة المستخدم
    auth.onAuthStateChanged(function(user) {
        if (user) {
            currentUserId = user.uid;
            showAuth(false);
            loadFolders();
        } else {
            currentUserId = null;
            showAuth(true);
        }
    });
   