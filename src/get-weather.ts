import axios from "axios";
import consola from "consola";
import {KafkaClient, Producer, ProduceRequest} from "kafka-node";

const API_KEY = 'f835cdfdc858438daf3141818240807';
let intervals: { [key: string]: NodeJS.Timeout } = {};

export const creerProducer = async (ville: string, kafkaHost: string, kafkaTopic: { topic: string }, kafkaProducers: { [p: string]: Producer }): Promise<any> => {
    const client = new KafkaClient({ kafkaHost });

    const producer = new Producer(client, {
        requireAcks: 1,
        ackTimeoutMs: 1000,
        partitionerType: 2,
    });

    producer.on('ready', async () => {
        consola.success(`Producteur créé pour ${ville}`);
        startWeatherUpdates(ville, kafkaProducers, kafkaTopic);
    });

    producer.on('error', (error) => {
        consola.error(`Erreur du producteur pour ${ville}:`, error);
    });

    kafkaProducers[ville] = producer;
    return producer;
};

export const closeProducer = (ville: string, kafkaProducers: { [p: string]: Producer }) => {
    if (kafkaProducers[ville]) {
        kafkaProducers[ville].close(() => {
            consola.success(`Producteur pour ${ville} fermé`);
        });
        delete kafkaProducers[ville];
    }

    if (intervals[ville]) {
        clearInterval(intervals[ville]);
        delete intervals[ville];
        consola.success(`Intervalle pour ${ville} effacé`);
    }
};

export const envoieWeather = async (ville: string, kafkaProducers: { [p: string]: Producer }, kafkaTopic: { topic: string }): Promise<void> => {
    const API_URL = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${ville}`;

    try {
        const response = await axios.get(API_URL);
        const weather = response.data;

        if (weather && kafkaProducers[ville]) {
            const payloads: ProduceRequest[] = [
                {
                    topic: kafkaTopic.topic,
                    messages: JSON.stringify(weather),
                },
            ];

            kafkaProducers[ville].send(payloads, (error) => {
                if (error) {
                    consola.error(`Erreur lors de l'envoi des données météo pour ${ville} à Kafka:`, error);
                } else {
                    consola.success(`Données météo pour ${ville} envoyées à Kafka`);
                }
            });
        }
    } catch (error) {
        consola.error('Erreur lors de la récupération ou de l\'envoi des données:', error);
    }
};

const startWeatherUpdates = (ville: string, kafkaProducers: { [p: string]: Producer }, kafkaTopic: { topic: string }) => {
    intervals[ville] = setInterval(async () => {
        await envoieWeather(ville, kafkaProducers, kafkaTopic);
    }, 1500);
    consola.success(`Mises à jour météo commencées pour ${ville}`);
};