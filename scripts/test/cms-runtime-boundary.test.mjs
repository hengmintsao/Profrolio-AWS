import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from 'yaml';

test('CMS execution role requires the supplied runtime permissions boundary without a default', () => {
  // Preserve CloudFormation's unresolved tagged scalar so the Ref target is checked.
  const template = parseDocument(
    readFileSync(
      new URL('../../infrastructure/cms-template.yaml', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(template.errors, []);
  assert.equal(
    template.getIn(['Parameters', 'RuntimePermissionsBoundaryArn', 'Type']),
    'String',
  );
  assert.equal(
    template.getIn(
      ['Parameters', 'RuntimePermissionsBoundaryArn', 'Default'],
      true,
    ),
    undefined,
  );
  const attachment = template.getIn(
    ['Resources', 'CmsExecutionRole', 'Properties', 'PermissionsBoundary'],
    true,
  );
  assert.equal(attachment?.tag, '!Ref');
  assert.equal(attachment?.value, 'RuntimePermissionsBoundaryArn');
});
