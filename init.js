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
