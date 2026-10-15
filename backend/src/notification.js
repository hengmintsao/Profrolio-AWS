import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

export function createNotificationHandler({ getContact, publish, markNotified, logError = console.error }) {
  return async (event) => {
    const batchItemFailures = [];
    for (const record of event.Records) {
      if (record.eventName !== 'INSERT') continue;
      const id = record.dynamodb.Keys.id.S;
      try {
        const contact = await getContact(id);
        if (!contact || contact.notificationStatus === 'sent') continue;
        await publish(contact);
        await markNotified(id);
      } catch {
        logError('contact.notification_failed', { submissionId: id });
        batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
      }
    }
    return { batchItemFailures };
  };
}

export const handler = createNotificationHandler({
  getContact: async (id) => (await dynamodb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { id },
    ConsistentRead: true,
  }))).Item,
  publish: (contact) => sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Subject: `Portfolio contact from ${contact.name}`.replace(/[\r\n\t]/g, ' ').slice(0, 100),
    Message: [
      `Submission ID: ${contact.id}`,
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone || 'Not provided'}`,
      '',
      contact.message || 'No message provided',
    ].join('\n'),
  }), { abortSignal: AbortSignal.timeout(3000) }),
  markNotified: (id) => dynamodb.send(new UpdateCommand({
    TableName: process.env.TABLE_NAME,
    Key: { id },
    UpdateExpression: 'SET notificationStatus = :sent, notifiedAt = :now',
    ConditionExpression: 'attribute_exists(id)',
    ExpressionAttributeValues: { ':sent': 'sent', ':now': new Date().toISOString() },
  })),
});
