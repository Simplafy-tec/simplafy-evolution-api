export interface MetaContactIdentity {
  pushName?: string;
  contactPhone?: string;
}

function firstNonBlank(...values: unknown[]): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
}

export function resolveMetaRemoteId(message: any): string | undefined {
  return firstNonBlank(message?.from, message?.to);
}

export function resolveMetaContactIdentity(
  received: any,
  message?: any,
  persistedPushName?: string,
): MetaContactIdentity {
  const contact = received?.contacts?.[0];

  return {
    pushName: firstNonBlank(
      contact?.profile?.name,
      contact?.name,
      persistedPushName,
      contact?.wa_id,
      contact?.user_id,
    ),
    contactPhone: firstNonBlank(contact?.profile?.phone, contact?.wa_id, resolveMetaRemoteId(message)),
  };
}
