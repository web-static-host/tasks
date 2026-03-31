const CONFIG = {
    SUPABASE_URL: 'https://zvgtqjivmereyxiodkub.supabase.co',
    SUPABASE_KEY: 'sb_publishable_KRIlHh6op0I-JuNSsRLQQQ_2XSzICXq',
    
    // Список пользователей для входа в систему
    USERS: [
        { id: 1, name: "Менеджер Иванович", role: "manager", dept: "Отдел продаж" },
        { id: 2, name: "Свиридкин А.В.", role: "specialist", dept: "Тех. отдел" },
        { id: 3, name: "Мурадов Р.А.", role: "specialist", dept: "Тех. отдел" }
    ],

    // Оставляем для обратной связи, если где-то используется напрямую
    MANAGER: {
        NAME: "Иванов Иван",
        DEPT: "Отдел продаж"
    },

    // Настройки рабочего времени специалистов
    SPECIALISTS: {
        "Свиридкин А.В.": {
            start: "08:30",
            end: "17:30",
            friday_end: "16:15",
            lunch: { start: "12:00", end: "13:00" },
            interval: 30 
        },
        "Мурадов Р.А.": {
            start: "09:00",
            end: "18:00",
            friday_end: "16:45",
            lunch: { start: "13:00", end: "14:00" },
            interval: 30
        }
    }
};