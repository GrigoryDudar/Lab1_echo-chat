const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Статичні файли
app.use(express.static(path.join(__dirname, 'public')));

// Зберігання інформації про користувачів
const clients = new Map();
const bannedUsers = new Set();
const adminUsers = new Set();

// Пароль для отримання прав адміністратора
const ADMIN_PASSWORD = 'admin123'; // В реальному проекті зберігайте це безпечно

wss.on('connection', (ws) => {
    let userId = null;
    let isAdmin = false;
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // Обробка різних типів повідомлень
        switch (data.type) {
            case 'login':
                // Перевірка, чи не заблоковано користувача
                if (bannedUsers.has(data.username)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Ви заблоковані в системі'
                    }));
                    return;
                }
                
                // Реєстрація користувача
                userId = data.username;
                isAdmin = adminUsers.has(userId);
                
                clients.set(userId, {
                    ws: ws,
                    username: data.username,
                    isAdmin: isAdmin
                });
                
                // Повідомлення про успішний вхід
                ws.send(JSON.stringify({
                    type: 'login',
                    success: true,
                    isAdmin: isAdmin
                }));
                
                // Повідомлення всім про нового користувача
                broadcastMessage({
                    type: 'notification',
                    message: `${userId} ${isAdmin ? '(Адміністратор)' : ''} приєднався до чату`,
                    timestamp: new Date().toISOString()
                });
                
                // Відправка списку користувачів
                sendUserList();
                break;
                
            case 'message':
                // Перевірка, чи авторизований користувач
                if (!userId) return;
                
                // Перевірка, чи не заблоковано користувача
                if (bannedUsers.has(userId)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Ви заблоковані в системі'
                    }));
                    return;
                }
                
                // Відправка повідомлення всім
                const messageData = {
                    type: 'message',
                    username: userId,
                    isAdmin: isAdmin,
                    text: data.text,
                    sentTimestamp: data.timestamp,
                    receivedTimestamp: new Date().toISOString()
                };
                
                broadcastMessage(messageData);
                break;
                
            case 'verifyAdmin':
                // Перевірка пароля адміністратора
                if (data.password === ADMIN_PASSWORD) {
                    isAdmin = true;
                    adminUsers.add(userId);
                    
                    // Оновлення інформації про клієнта
                    if (clients.has(userId)) {
                        const clientInfo = clients.get(userId);
                        clientInfo.isAdmin = true;
                        clients.set(userId, clientInfo);
                    }
                    
                    // Повідомлення про успішне отримання прав адміністратора
                    ws.send(JSON.stringify({
                        type: 'adminVerified',
                        success: true
                    }));
                    
                    // Сповіщення всіх про нового адміністратора
                    broadcastMessage({
                        type: 'notification',
                        message: `${userId} отримав права адміністратора`,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Оновлення списку користувачів
                    sendUserList();
                } else {
                    ws.send(JSON.stringify({
                        type: 'adminVerified',
                        success: false,
                        message: 'Невірний пароль адміністратора'
                    }));
                }
                break;
                
            case 'ban':
                // Перевірка, чи авторизований користувач
                if (!userId) return;
                
                // Перевірка прав адміністратора
                if (!isAdmin) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'У вас немає прав адміністратора для блокування користувачів'
                    }));
                    return;
                }
                
                const userToBan = data.username;
                
                // Неможливо заблокувати адміністратора
                if (adminUsers.has(userToBan)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Неможливо заблокувати адміністратора'
                    }));
                    return;
                }
                
                // Додавання користувача до списку заблокованих
                bannedUsers.add(userToBan);
                
                // Відключення користувача, якщо він зараз у мережі
                if (clients.has(userToBan)) {
                    const clientWs = clients.get(userToBan).ws;
                    clientWs.send(JSON.stringify({
                        type: 'banned',
                        message: `Вас заблоковано адміністратором ${userId}`
                    }));
                    
                    // Видалення користувача зі списку клієнтів
                    clients.delete(userToBan);
                    clientWs.close();
                }
                
                // Повідомлення про блокування
                broadcastMessage({
                    type: 'notification',
                    message: `Користувача ${userToBan} заблоковано адміністратором ${userId}`,
                    timestamp: new Date().toISOString()
                });
                
                // Оновлення списку користувачів
                sendUserList();
                break;
        }
    });
    
    ws.on('close', () => {
        if (userId) {
            // Видалення користувача зі списку клієнтів
            clients.delete(userId);
            
            // Повідомлення про вихід користувача
            broadcastMessage({
                type: 'notification',
                message: `${userId} ${isAdmin ? '(Адміністратор)' : ''} покинув чат`,
                timestamp: new Date().toISOString()
            });
            
            // Оновлення списку користувачів
            sendUserList();
        }
    });
    
    // Функція для розсилки повідомлення всім клієнтам
    function broadcastMessage(message) {
        clients.forEach((client) => {
            client.ws.send(JSON.stringify(message));
        });
    }
    
    // Функція для відправки списку користувачів
    function sendUserList() {
        const usersList = Array.from(clients.entries()).map(([username, info]) => {
            return {
                username: username,
                isAdmin: info.isAdmin
            };
        });
        
        const userListMessage = {
            type: 'userList',
            users: usersList
        };
        
        clients.forEach((client) => {
            client.ws.send(JSON.stringify(userListMessage));
        });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});