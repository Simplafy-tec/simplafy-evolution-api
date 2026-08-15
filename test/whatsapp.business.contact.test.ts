import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveMetaContactIdentity,
  resolveMetaRemoteId,
} from '../src/api/integrations/channel/meta/whatsapp.business.contact';

describe('resolveMetaContactIdentity', () => {
  it('accepts the new Meta payload without profile', () => {
    const identity = resolveMetaContactIdentity(
      { contacts: [{ wa_id: '556196229902', user_id: 'BR.1068445862310027' }] },
      { from: '556196229902' },
    );

    assert.deepEqual(identity, {
      pushName: '556196229902',
      contactPhone: '556196229902',
    });
  });

  it('keeps the legacy profile fields when present', () => {
    const identity = resolveMetaContactIdentity(
      { contacts: [{ wa_id: '556100000000', profile: { name: 'Fabiano', phone: '556199999999' } }] },
      { from: '556100000000' },
    );

    assert.deepEqual(identity, {
      pushName: 'Fabiano',
      contactPhone: '556199999999',
    });
  });

  it('falls back to the message sender when contacts are absent', () => {
    const identity = resolveMetaContactIdentity({}, { from: '556188888888' });

    assert.deepEqual(identity, {
      pushName: undefined,
      contactPhone: '556188888888',
    });
  });

  it('ignores blank legacy fields and keeps the valid wa_id', () => {
    const identity = resolveMetaContactIdentity(
      { contacts: [{ wa_id: '556177777777', profile: { name: ' ', phone: '' } }] },
      { from: '556166666666' },
    );

    assert.deepEqual(identity, {
      pushName: '556177777777',
      contactPhone: '556177777777',
    });
  });

  it('preserves the persisted human name when Meta omits profile', () => {
    const identity = resolveMetaContactIdentity(
      { contacts: [{ wa_id: '556177777777', user_id: 'BR.123' }] },
      { from: '556177777777' },
      'Cliente Brasal',
    );

    assert.deepEqual(identity, {
      pushName: 'Cliente Brasal',
      contactPhone: '556177777777',
    });
  });

  it('resolves each message independently and rejects missing counterparts', () => {
    assert.equal(resolveMetaRemoteId({ from: '556155555555' }), '556155555555');
    assert.equal(resolveMetaRemoteId({ to: '556144444444' }), '556144444444');
    assert.equal(resolveMetaRemoteId({}), undefined);
  });
});
