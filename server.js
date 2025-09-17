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

wss.on('connection', (ws) => {
    let userId = null;
    
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
                clients.set(userId, {
                    ws: ws,
                    username: data.username
                });
                
                // Повідомлення про успішний вхід
                ws.send(JSON.stringify({
                    type: 'login',
                    success: true
                }));
                // Повідомлення всім про нового користувача
                broadcastMessage({
                    type: 'notification',
                    message: `${userId} приєднався до чату`,
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
                    text: data.text,
                    sentTimestamp: data.timestamp,
                    receivedTimestamp: new Date().toISOString()
                };
                
                broadcastMessage(messageData);
                break;
                
            case 'ban':
                // Перевірка, чи авторизований користувач
                if (!userId) return;
                
                const userToBan = data.username;
                
                // Додавання користувача до списку заблокованих
                bannedUsers.add(userToBan);
                
                // Відключення користувача, якщо він зараз у мережі
                if (clients.has(userToBan)) {
                    const clientWs = clients.get(userToBan).ws;
                    clientWs.send(JSON.stringify({
                        type: 'banned',
                        message: `Вас заблоковано користувачем ${userId}`
                    }));
                    
                    // Видалення користувача зі списку клієнтів
                    clients.delete(userToBan);
                    clientWs.close();
                }
                
                // Повідомлення про блокування
                broadcastMessage({
                    type: 'notification',
                    message: `Користувача ${userToBan} заблоковано`,
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
                message: `${userId} покинув чат`,
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
        const users = Array.from(clients.keys());
        const userListMessage = {
            type: 'userList',
            users: users
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