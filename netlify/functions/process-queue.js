const { runScheduledQueuePublish } = require('../../services/publishingApi');
const { json } = require('./_lib/http');

exports.handler = async () => {
    try {
        const result = await runScheduledQueuePublish({
            limit: Number(process.env.PUBLISH_QUEUE_BATCH_SIZE || 20)
        });

        return json(200, {
            success: true,
            message: 'Scheduled queue processing completed',
            ...result
        });
    } catch (error) {
        return json(500, {
            success: false,
            error: 'Scheduled queue processing failed',
            details: error.message
        });
    }
};
