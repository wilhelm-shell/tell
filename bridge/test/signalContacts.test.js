import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactName, mapDirectory } from '../src/signalContacts.js';

// Shapes as returned by signal-cli 0.14.7 listContacts / listGroups.
function contact(over) {
  return Object.assign({
    number: '+41000000001', uuid: null, username: null, name: '', givenName: null, familyName: null,
    nickName: null, isArchived: false, isBlocked: false, isHidden: false, unregistered: false,
    profile: { givenName: null, familyName: null },
  }, over);
}

test('contactName falls back: name → given+family → profile → nick → number', () => {
  assert.equal(contactName(contact({ name: 'Alice A', givenName: 'X' })), 'Alice A');
  assert.equal(contactName(contact({ givenName: 'Bob', familyName: 'B' })), 'Bob B');
  assert.equal(contactName(contact({ givenName: 'Bob' })), 'Bob');
  assert.equal(contactName(contact({ profile: { givenName: 'Pro', familyName: 'File' } })), 'Pro File');
  assert.equal(contactName(contact({ nickName: 'nick' })), 'nick');
  assert.equal(contactName(contact({ name: '   ' })), '+41000000001');
});

test('mapDirectory filters, dedups, tags, and sorts by name', () => {
  const contacts = [
    contact({ number: '+1', name: 'zed' }),
    contact({ number: '+2', name: 'Alice' }),
    contact({ number: '+2', name: 'Alice again' }),
    contact({ number: '+3', name: 'Blocked', isBlocked: true }),
    contact({ number: '+4', name: 'Hidden', isHidden: true }),
    contact({ number: '+5', name: 'Gone', unregistered: true }),
    contact({ number: null, name: 'No number' }),
    null,
  ];
  const groups = [
    { id: 'g1=', name: 'Family', isMember: true, isBlocked: false },
    { id: 'g2=', name: 'Left', isMember: false, isBlocked: false },
    { id: 'g3=', name: '', isMember: true, isBlocked: false },
    { id: '', name: 'bad', isMember: true, isBlocked: false },
  ];
  assert.deepEqual(mapDirectory(contacts, groups), [
    { kind: 'contact', id: '+2', name: 'Alice' },
    { kind: 'group', id: 'g1=', name: 'Family' },
    { kind: 'group', id: 'g3=', name: 'group' },
    { kind: 'contact', id: '+1', name: 'zed' },
  ]);
});

test('mapDirectory tolerates non-arrays', () => {
  assert.deepEqual(mapDirectory(null, undefined), []);
});
