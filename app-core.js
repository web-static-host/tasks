// Проверка инициализации Supabase
if (typeof supabase === 'undefined') {
    var supabase; 
}

try {
    supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    console.log("✅ Supabase на связи!");
} catch (err) {
    console.error("❌ Ошибка инициализации:", err);
}

let currentUser = null;

// 1. АВТОРИЗАЦИЯ И ИНИЦИАЛИЗАЦИЯ
window.addEventListener('DOMContentLoaded', () => {
    const userSelect = document.getElementById('user-select');
    const specSelect = document.getElementById('specialist');

    if (userSelect && CONFIG.USERS) {
        CONFIG.USERS.forEach(user => {
            const opt = new Option(user.name, user.id);
            userSelect.add(opt);

            if (user.role === 'specialist' && specSelect) {
                specSelect.add(new Option(user.name, user.name));
            }
        });
    }

    const savedId = localStorage.getItem('savedUserId');
    if (savedId) {
        const foundUser = CONFIG.USERS.find(u => u.id == savedId);
        if (foundUser) {
            currentUser = foundUser;
            showMainContent();
        } else {
            document.body.style.display = 'block';
        }
    } else {
        document.body.style.display = 'block';
    }

    initFilters();
});

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

function setupInterface() {
    const userInfo = document.getElementById('user-info');
    const thRole = document.getElementById('th-user-role');
    const addBtn = document.getElementById('add-task-btn');
    const techContainer = document.getElementById('tech-filters-container');
    const techFilters = document.getElementById('tech-filters');

    if (userInfo) {
        userInfo.innerText = `${currentUser.name} (${currentUser.role === 'manager' ? 'Менеджер' : 'Технарь'})`;
    }

    if (currentUser.role === 'specialist') {
        if (thRole) thRole.innerText = "Менеджер";
        if (addBtn) addBtn.style.display = 'none';
        // Скрываем блок фильтров технарей, если зашел специалист
        if (techContainer) techContainer.classList.add('d-none');
    } else {
        if (thRole) thRole.innerText = "Специалист";
        if (addBtn) addBtn.style.display = 'block';
        
        // Рендерим кнопки технарей для менеджера
        if (techContainer && techFilters) {
            techContainer.classList.remove('d-none');
            // Очищаем и добавляем кнопку "Все" по умолчанию
            techFilters.innerHTML = `<button type="button" class="btn btn-sm btn-outline-secondary active" onclick="setTechFilter('all', this)">Все</button>`;
            
            // Добавляем кнопки для каждого специалиста из конфига
            CONFIG.USERS.filter(u => u.role === 'specialist').forEach(tech => {
                techFilters.insertAdjacentHTML('beforeend', 
                    `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="setTechFilter('${tech.name}', this)">${tech.name}</button>`
                );
            });
        }
    }
}