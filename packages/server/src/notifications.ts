import { categoryOf, type DomainEvent, type EventType } from '@dt/domain';
import { num, str, type Db, type Row } from './db.ts';

/** Observer: anything that reacts to events delivered by the outbox relay. */
export interface EventSubscriber {
  onEvent(db: Db, event: DomainEvent, outboxId: number): Promise<void>;
}

/**
 * Hands each unprocessed outbox event to every subscriber. Runs as the
 * database owner, outside any user's scope. An event that fails stays
 * unprocessed and is retried (up to ten attempts, see claim_outbox).
 */
export async function relayOutbox(db: Db, subscribers: readonly EventSubscriber[], batchSize = 50): Promise<number> {
  const { rows } = await db.query('select * from claim_outbox($1)', [batchSize]);
  for (const row of rows) {
    try {
      const event = (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as DomainEvent;
      for (const subscriber of subscribers) await subscriber.onEvent(db, event, num(row.id));
      await db.query('update outbox set processed_at = now(), last_error = null where id = $1', [row.id]);
    } catch (error) {
      await db.query('update outbox set last_error = $1 where id = $2', [String(error), row.id]);
    }
  }
  return rows.length;
}

export interface Recipient {
  userId: string;
  language: string;
}

/** Decides who may receive a message (UC29 step 3). Preferences arrive in Version 1 (UC31). */
export class RecipientResolver {
  async resolve(db: Db, event: DomainEvent): Promise<Recipient[]> {
    // A removed member is told once, after which they are outside the business.
    const mustBeMember = event.type !== 'MemberRemoved';
    const { rows } = await db.query(
      `select p.id, p.language from profiles p
       where p.id <> $2
         and (p.id = $3 or ($3 is null and exists (
           select 1 from memberships m where m.business_id = $1 and m.user_id = p.id
             and m.role = 'owner' and m.ended_at is null)))
         and (not $4 or exists (
           select 1 from memberships m where m.business_id = $1 and m.user_id = p.id and m.ended_at is null))`,
      [event.businessId, event.actorId, event.subjectUserId, mustBeMember],
    );
    return rows.map((r: Row) => ({ userId: str(r.id), language: str(r.language) }));
  }
}

export interface Message {
  title: string;
  body: string;
}

/**
 * Decides what a message says, in the recipient's language (UC29 step 4).
 * Messages never carry amounts or document numbers, only a prompt to open the
 * app (section 9.2).
 */
export class MessageComposer {
  constructor(private readonly catalogues: Record<string, Partial<Record<EventType, Message>>>) {}

  compose(event: DomainEvent, language: string): Message {
    return this.catalogues[language]?.[event.type] ?? this.catalogues['en']?.[event.type] ?? FALLBACK;
  }
}

const FALLBACK: Message = { title: 'Digital Transport Business Management System', body: 'You have an update. Open the app to see it.' };

export interface PushGateway {
  /** Returns false when the push service refused or the token is dead. */
  send(token: string, message: Message & { data: Record<string, unknown> }): Promise<boolean>;
}

export interface Delivery {
  recipient: Recipient;
  event: DomainEvent;
  message: Message;
  notificationId: string;
}

export type Channel = 'push' | 'inbox' | 'sms';

/** Chain of Responsibility: push, then the in-app inbox; SMS for critical alerts in Version 1. */
export abstract class NotificationHandler {
  private next: NotificationHandler | null = null;

  setNext(handler: NotificationHandler): NotificationHandler {
    this.next = handler;
    return handler;
  }

  abstract handle(db: Db, delivery: Delivery): Promise<Channel>;

  protected passOn(db: Db, delivery: Delivery): Promise<Channel> {
    if (this.next === null) throw new Error('No handler delivered the notification');
    return this.next.handle(db, delivery);
  }
}

export class PushHandler extends NotificationHandler {
  constructor(private readonly gateway: PushGateway) {
    super();
  }

  async handle(db: Db, delivery: Delivery): Promise<Channel> {
    const { rows } = await db.query<{ token: string }>('select token from device_tokens where user_id = $1', [
      delivery.recipient.userId,
    ]);
    let delivered = false;
    for (const { token } of rows) {
      const ok = await this.gateway.send(token, {
        ...delivery.message,
        data: { link: delivery.event.link, notificationId: delivery.notificationId },
      });
      delivered ||= ok;
    }
    return delivered ? 'push' : this.passOn(db, delivery);
  }
}

/** The inbox row already exists, so the message is never lost (UC29 5a). */
export class InAppHandler extends NotificationHandler {
  async handle(): Promise<Channel> {
    return 'inbox';
  }
}

export class NotificationService implements EventSubscriber {
  constructor(
    private readonly resolver: RecipientResolver,
    private readonly composer: MessageComposer,
    private readonly chain: NotificationHandler,
  ) {}

  async onEvent(db: Db, event: DomainEvent, outboxId: number): Promise<void> {
    for (const recipient of await this.resolver.resolve(db, event)) {
      // Idempotent per event and recipient, so a retried relay never double-notifies.
      const { rows } = await db.query<{ id: string }>(
        `insert into notifications (user_id, business_id, outbox_id, event_type, category, link, critical)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (outbox_id, user_id) do nothing returning id`,
        [recipient.userId, event.businessId, outboxId, event.type, categoryOf(event.type), event.link, event.critical],
      );
      const inserted = rows[0];
      if (!inserted) continue;
      const message = this.composer.compose(event, recipient.language);
      const channel = await this.chain.handle(db, { recipient, event, message, notificationId: inserted.id });
      await db.query('update notifications set delivered_via = $1 where id = $2', [channel, inserted.id]);
    }
  }
}

export function notificationService(gateway: PushGateway, catalogues: ConstructorParameters<typeof MessageComposer>[0]) {
  const chain = new PushHandler(gateway);
  chain.setNext(new InAppHandler());
  return new NotificationService(new RecipientResolver(), new MessageComposer(catalogues), chain);
}
