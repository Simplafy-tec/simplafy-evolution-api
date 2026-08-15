export interface MetaContactIdentity {
  pushName?: string;
  contactPhone?: string;
}

export function resolveMetaContactIdentity(received: any, message?: any): MetaContactIdentity {
  const contact = received?.contacts?.[0];

  return {
    pushName: contact?.profile?.name ?? contact?.name ?? contact?.wa_id ?? contact?.user_id,
    contactPhone: contact?.profile?.phone ?? contact?.wa_id ?? message?.from,
  };
}
