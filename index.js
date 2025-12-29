const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal'); 
const pino = require('pino');

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN ---
// Cambia esto por TU usuario real de PythonAnywhere
const PYTHON_URL = 'http://mariourbaez10.pythonanywhere.com/webhook/whatsapp'; 
const PORT = process.env.PORT || 3000;

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // ESTO DEBE ESTAR EN FALSE
        logger: pino({ level: 'silent' }),
        browser: ["Colmado Bot", "Chrome", "1.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // ESTA PARTE DIBUJA EL QR MANUALMENTE
        if (qr) {
            console.log('\n================================================');
            console.log('   ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP:');
            console.log('================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('\n✅ ¡CONECTADO A WHATSAPP EXITOSAMENTE!\n');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            const remoto = msg.key.remoteJid;
            const telefono = remoto.split('@')[0];
            
            const texto = msg.message.conversation || 
                          msg.message.extendedTextMessage?.text || 
                          msg.message.imageMessage?.caption || "";

            if (texto) {
                console.log(`Mensaje de ${telefono}: ${texto}`);
                
                try {
                    await axios.post(PYTHON_URL, {
                        telefono: telefono,
                        texto: texto,
                        nombre: msg.pushName
                    });
                } catch (error) {
                    console.error("Error enviando a Python:", error.message);
                }
            }
        }
    });
}

app.post('/send-message', async (req, res) => {
    const { telefono, mensaje } = req.body;
    if (!sock) return res.status(500).json({ status: 'error', msg: 'WhatsApp no conectado' });

    try {
        const id = `${telefono}@c.us`;
        await sock.sendMessage(id, { text: mensaje });
        res.json({ status: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', msg: error.message });
    }
});

app.get('/', (req, res) => res.send('🤖 El Puente WhatsApp está ACTIVO.'));

app.listen(PORT, () => {
    console.log(`Servidor Puente corriendo en puerto ${PORT}`);
    connectToWhatsApp();
});
