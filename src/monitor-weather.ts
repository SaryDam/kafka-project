import { ConsumerGroup, Producer } from "kafka-node";
import { closeProducer } from "./get-weather.js";
import consola from "consola";

export const creerConsumerGroup = (kafkaHost: string, kafkaTopic: { topic: string }): ConsumerGroup =>
    new ConsumerGroup({
        kafkaHost,
        groupId: 'weather-group',
        autoCommit: true,
        fromOffset: 'latest',
        encoding: 'utf8'
    }, [kafkaTopic.topic]);

export const closeConsumerGroup = (kafkaConsumerGroup: ConsumerGroup, kafkaProducers: { [key: string]: Producer }) => {
    kafkaConsumerGroup.close(true, () => {
        consola.success('Groupe de consommateurs fermé');
        Object.keys(kafkaProducers).forEach((city) => {
            closeProducer(city, kafkaProducers);
        });
        process.exit();
    });
};
