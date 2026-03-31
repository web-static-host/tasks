let currentUser = null;

function login() {
    const userId = document.getElementById('user-select').value;
    if (!userId) return alert("Выберите пользователя!");
    currentUser = CONFIG.USERS.find(u => u.id == userId);
    if (currentUser) {
        localStorage.setItem('savedUserId', currentUser.id);
        showMainContent();
    }
}

function logout() {
    if (confirm("Выйти из системы?")) {
        localStorage.removeItem('savedUserId');
        currentUser = null;
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'block';
        document.getElementById('user-select').value = "";
    }
}

function showMainContent() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.body.style.display = 'block'; 
    setupInterface();
    loadTasks();
}

