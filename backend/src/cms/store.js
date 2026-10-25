import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ApiError, fail } from './validation.js';
const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);
export function memoryStore() {
  const rows = new Map();
  return {
    async get(pk) {
      return clone(rows.get(pk));
    },
    async list(group, cursor) {
      let start = 0;
      if (cursor) {
        try {
          const decoded = JSON.parse(
            Buffer.from(cursor, 'base64url').toString(),
          );
          if (
            decoded.group !== group ||
            !Number.isInteger(decoded.offset) ||
            decoded.offset < 0
          )
            throw Error();
          start = decoded.offset;
        } catch {
          fail(400, 'VALIDATION', 'Invalid cursor.');
        }
      }
      const items = [...rows.values()]
        .filter((row) => row.gsiPk === group)
        .sort((a, b) => a.pk.localeCompare(b.pk));
      return {
        items: clone(items.slice(start, start + 30)),
        nextCursor:
          start + 30 < items.length
            ? Buffer.from(
                JSON.stringify({ group, offset: start + 30 }),
              ).toString('base64url')
            : null,
      };
    },
    async commit(changes) {
      for (const change of changes) {
        const current = rows.get(change.pk);
        if (
          (change.absent && current) ||
          (change.revision !== undefined &&
            current?.revision !== change.revision) ||
          (change.owner !== undefined && current?.owner !== change.owner)
        )
          throw new ApiError(
            409,
            'CONFLICT',
            'The content changed or slug is reserved. Reload before retrying.',
          );
      }
      for (const change of changes) {
        if (change.value) rows.set(change.pk, clone(change.value));
        else rows.delete(change.pk);
      }
    },
  };
}
export function dynamoStore(
  tableName,
  client = DynamoDBDocumentClient.from(new DynamoDBClient({})),
) {
  const key = (pk) => ({ pk });
  return {
    async get(pk) {
      return (
        await client.send(
          new GetCommand({
            TableName: tableName,
            Key: key(pk),
            ConsistentRead: true,
          }),
        )
      ).Item;
    },
    async list(group, cursor) {
      let start;
      if (cursor) {
        try {
          const decoded = JSON.parse(
            Buffer.from(cursor, 'base64url').toString(),
          );
          if (
            decoded.group !== group ||
            !decoded.key ||
            typeof decoded.key.pk !== 'string' ||
            decoded.key.gsiPk !== group ||
            typeof decoded.key.gsiSk !== 'string'
          )
            throw Error();
          start = decoded.key;
        } catch {
          fail(400, 'VALIDATION', 'Invalid cursor.');
        }
      }
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'ListingIndex',
          KeyConditionExpression: 'gsiPk = :group',
          ExpressionAttributeValues: { ':group': group },
          Limit: 30,
          ...(start ? { ExclusiveStartKey: start } : {}),
        }),
      );
      return {
        items: result.Items || [],
        nextCursor: result.LastEvaluatedKey
          ? Buffer.from(
              JSON.stringify({ group, key: result.LastEvaluatedKey }),
            ).toString('base64url')
          : null,
      };
    },
    async commit(changes) {
      const TransactItems = changes.map((change) => {
        const conditions = [],
          values = {},
          names = {};
        if (change.absent) conditions.push('attribute_not_exists(pk)');
        if (change.revision !== undefined) {
          conditions.push('#revision = :revision');
          names['#revision'] = 'revision';
          values[':revision'] = change.revision;
        }
        if (change.owner !== undefined) {
          conditions.push('#owner = :owner');
          names['#owner'] = 'owner';
          values[':owner'] = change.owner;
        }
        const command = {
          TableName: tableName,
          ...(change.value ? { Item: change.value } : { Key: key(change.pk) }),
          ...(conditions.length
            ? { ConditionExpression: conditions.join(' AND ') }
            : {}),
          ...(Object.keys(values).length
            ? { ExpressionAttributeValues: values }
            : {}),
          ...(Object.keys(names).length
            ? { ExpressionAttributeNames: names }
            : {}),
        };
        return { [change.value ? 'Put' : 'Delete']: command };
      });
      try {
        await client.send(new TransactWriteCommand({ TransactItems }));
      } catch (error) {
        if (
          error.name === 'TransactionCanceledException' &&
          error.CancellationReasons?.some(
            (reason) => reason.Code === 'ConditionalCheckFailed',
          )
        )
          fail(
            409,
            'CONFLICT',
            'The content changed or slug is reserved. Reload before retrying.',
          );
        throw error;
      }
    },
  };
}
