import express from 'express';
import path from 'path';
import {WebSocket, WebSocketServer} from 'ws';
import {fileURLToPath} from 'url';
import * as http from "http";
import {closeProducer, creerProducer} from './get-weather.js';
import consola from "consola";
import {KafkaClient, Producer} from "kafka-node";
import {closeConsumerGroup, creerConsumerGroup} from "./monitor-weather.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const port = 3000;

const kafkaHost = 'localhost:9092';

const kafkaTopic = {
    topic: 'weather',
    partitions: 10,
    replicationFactor: 1,
};

const kafkaClient = new KafkaClient({kafkaHost});

const kafkaConsumerGroup = creerConsumerGroup(kafkaHost, kafkaTopic);

let kafkaProducers: { [key: string]: Producer } = {};

const wss = new WebSocketServer({noServer: true});

const server = http.createServer(app);

kafkaClient.createTopics([kafkaTopic], (error, result) => {
    if (error) {
        consola.error('Erreur lors de la création du sujet Kafka:', error);
        process.exit(1);
    } else {
        consola.success('Sujet Kafka créé avec succès');
    }
});

wss.on('connection', function connection(ws) {
    consola.success('Client WebSocket connecté');

    ws.on('message', async (message) => {
        const ville = message.toString();
        consola.success(`Ville reçue: ${ville}`);

        if (ville) {
            if (!kafkaProducers[ville]) {
                kafkaProducers[ville] = await creerProducer(ville, kafkaHost, kafkaTopic, kafkaProducers);
            } else {
                closeProducer(ville, kafkaProducers);
            }
        }
    });
});

kafkaConsumerGroup.on('message', async (message) => {
    try {
        const weatherData = JSON.parse(message.value.toString());
        consola.log(`Mise à jour météo reçue pour ${weatherData.location.name}: ${weatherData.current.temp_c}°C, ${weatherData.current.condition.text}`);

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(weatherData));
            }
        });

        app.locals.latestWeatherData = weatherData;
    } catch (error) {
        consola.error('Erreur lors de l\'analyse ou du traitement du message:', error);
    }
});

kafkaConsumerGroup.on('error', (error) => {
    consola.error('Erreur du consommateur:', error);
});

app.use(express.static(path.join(__dirname, '/public')));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

server.on('upgrade', function (request, socket, head) {
    wss.handleUpgrade(request, socket, head, function (ws) {
        wss.emit('connection', ws, request);
    });
});

server.listen(port, () => {
    consola.log(`Serveur à l'écoute sur http://localhost:${port}`);
});

process.on('SIGINT', async () => {
    consola.info('SIGINT reçu, arrêt du consommateur et des producteurs');

    closeConsumerGroup(kafkaConsumerGroup, kafkaProducers);
});