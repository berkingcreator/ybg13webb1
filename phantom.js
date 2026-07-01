// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
const net = require('net');
const fs = require('fs');

const TRAP_PORTS = [
    { port: 22, name: 'Sahte SSH Servisi' },
    { port: 21, name: 'Sahte FTP Deposu' },
    { port: 1433, name: 'Sahte MSSQL Veritabanı' }
];

const logStream = fs.createWriteStream('phantom_attacks.log', { flags: 'a', encoding: 'utf-8' });

logStream.on('error', (err) => {
    console.error(`\x1b[31m[Loglama Hatası] Dosyaya yazılamadı: ${err.message}\x1b[0m`);
});

process.on('uncaughtException', (err) => {
    console.error(`\x1b[31m[Kritik Sistem Hatası] ${err.message}\x1b[0m`);
});

function logAttack(portName, port, attackerIp, inputData) {
    if (!inputData) return;
    
    const timestamp = new Date().toISOString();
    const cleanInput = inputData.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
    
    if (cleanInput.length === 0) return; 

    const logMessage = `[${timestamp}] [Saldırı Tespit Edildi!] Servis: ${portName} (${port}) | Saldırgan IP: ${attackerIp} | Denediği Komut/Veri: ${cleanInput}\n`;
    
    console.log(`\x1b[31m${logMessage.trim()}\x1b[0m`);
    logStream.write(logMessage);
}

TRAP_PORTS.forEach(trap => {
    const server = net.createServer((socket) => {
        const attackerIp = socket.remoteAddress?.replace(/^.*:/, '') || 'Bilinmeyen IP';
        
        socket.setTimeout(10000);
        
        if (trap.port === 22) {
            socket.write('SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5\r\n');
        } else if (trap.port === 21) {
            socket.write('220 (vsFTPd 3.0.3) Ready.\r\n');
        } else {
            socket.write('YBG13 Corporate Server Login:\r\n');
        }

        let payloadBuffer = '';
        const MAX_PAYLOAD_SIZE = 2048;
        let replyTimeout;

        socket.on('data', (data) => {
            if (payloadBuffer.length + data.length > MAX_PAYLOAD_SIZE) {
                logAttack(trap.name, trap.port, attackerIp, payloadBuffer);
                socket.destroy();
                return;
            }

            payloadBuffer += data.toString('utf-8');

            clearTimeout(replyTimeout);
            
            replyTimeout = setTimeout(() => {
                if (!socket.destroyed) {
                    socket.write('Permission denied, please try again.\r\n');
                    logAttack(trap.name, trap.port, attackerIp, payloadBuffer);
                    payloadBuffer = ''; 
                }
            }, 1000);
        });

        socket.on('end', () => {
            if (payloadBuffer.length > 0) {
                logAttack(trap.name, trap.port, attackerIp, payloadBuffer);
            }
        });

        socket.on('timeout', () => {
            socket.destroy();
        });

        socket.on('error', () => {
            socket.destroy();
        });
    });

    server.maxConnections = 100;

    server.on('error', (err) => {
        console.log(`\x1b[33m[Aegis Phantom Uyarı] ${trap.port} portu dinlenemedi: ${err.message}\x1b[0m`);
    });

    server.listen(trap.port, () => {
        console.log(`\x1b[32m[Aegis Phantom] ${trap.name} Port ${trap.port} üzerinde aktif.\x1b[0m`);
    });
});
