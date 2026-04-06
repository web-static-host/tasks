const CONFIG = {
    SUPABASE_URL: 'https://zvgtqjivmereyxiodkub.supabase.co',
    SUPABASE_KEY: 'sb_publishable_KRIlHh6op0I-JuNSsRLQQQ_2XSzICXq',
    
    USERS: [],
    // USERS: [
    //     { id: 1, name: "Менеджер Иванович", role: "manager", dept: "Отдел продаж" },
    //     { id: 2, name: "Свиридкин А.В.", role: "specialist", dept: "Тех. отдел" },
    //     { id: 3, name: "Мурадов Р.А.", role: "specialist", dept: "Тех. отдел" }
    // ],
    SPECIALISTS: {},

    // Оставляем для обратной связи, если где-то используется напрямую
    MANAGER: {
        NAME: "Иванов Иван",
        DEPT: "Отдел продаж"
    },

    

};


// Загружаем только тех, кто может быть исполнителем (Специалисты)
async function syncUsersWithLoginList() {
    // МГНОВЕННО: Проверяем кэш, чтобы не ждать базу
    const cached = localStorage.getItem('cache_tech_users');
    if (cached) {
        try {
            CONFIG.USERS = JSON.parse(cached) || [];
            
            // СРАЗУ ПИНАЕМ ИНТЕРФЕЙС, чтобы кнопки появились до запроса к серверу
            if (typeof setupInterface === 'function') setupInterface();
        } catch (e) {
            CONFIG.USERS = [];
        }
    }

    try {
        // ФОНОВЫЙ ЗАПРОС (обновляем кэш свежими данными)
        const { data: techRoleLinks } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role_id', 3);

        const techIds = techRoleLinks.map(link => link.user_id);

        const { data: dbUsers, error: userErr } = await supabase
            .from('users')
            .select('id, display_name, full_name, dept')
            .in('id', techIds)
            .eq('is_active', true);

        if (userErr) throw userErr;

        const freshUsers = dbUsers.map(u => ({
            id: u.id,
            name: u.display_name || u.full_name,
            role: 'specialist',
            dept: u.dept || "Тех. отдел"
        }));

        // Если данные в базе отличаются от кэша — обновляем
        if (JSON.stringify(freshUsers) !== JSON.stringify(CONFIG.USERS)) {
            CONFIG.USERS = freshUsers;
            localStorage.setItem('cache_tech_users', JSON.stringify(freshUsers));
        }

    } catch (err) {
        console.error("Ошибка фоновой загрузки:", err);
    }
}


// Настройки рабочего времени специалистов
async function syncSpecialistsWithConfig() {
    // МГНОВЕННО: Проверяем кэш
    const cached = localStorage.getItem('cache_spec_settings');
    if (cached) {
        CONFIG.SPECIALISTS = JSON.parse(cached);
        if (typeof fillSpecialistDropdown === 'function') fillSpecialistDropdown();
        if (typeof renderTechFilters === 'function') renderTechFilters();
    }

    try {
        // Если списка юзеров еще нет (даже в кэше), ждем базу
        if (!CONFIG.USERS || CONFIG.USERS.length === 0) return;

        const techIds = CONFIG.USERS.map(u => u.id);
        const { data: settingsList, error: setErr } = await supabase
            .from('specialist_settings')
            .select('*')
            .in('user_id', techIds);

        if (setErr) throw setErr;

        const freshSettings = {};
        CONFIG.USERS.forEach(user => {
            const s = settingsList.find(item => item.user_id === user.id);
            freshSettings[user.name] = {
                start: s?.work_start?.substring(0, 5) || "09:00",
                end: s?.work_end?.substring(0, 5) || "18:00",
                friday_end: s?.friday_end?.substring(0, 5) || "16:45",
                lunch: { 
                    start: s?.lunch_start?.substring(0, 5) || "13:00", 
                    end: s?.lunch_end?.substring(0, 5) || "14:00" 
                },
                interval: s?.slot_interval || 30
            };
        });

        // Если в базе настройки поменялись — сохраняем и перерисовываем
        if (JSON.stringify(freshSettings) !== JSON.stringify(CONFIG.SPECIALISTS)) {
            CONFIG.SPECIALISTS = freshSettings;
            localStorage.setItem('cache_spec_settings', JSON.stringify(freshSettings));
            if (typeof fillSpecialistDropdown === 'function') fillSpecialistDropdown();
            if (typeof renderTechFilters === 'function') renderTechFilters();
        }

    } catch (err) {
        console.error("Ошибка синхронизации настроек:", err);
    }
}

// Заполнение <select id="specialist"> именами из нового CONFIG
function fillSpecialistDropdown() {
    const select = document.getElementById('specialist');
    if (!select) return;

    const names = Object.keys(CONFIG.SPECIALISTS);
    select.innerHTML = '<option value="">Выберите специалиста...</option>' + 
        names.map(name => `<option value="${name}">${name}</option>`).join('');
}

