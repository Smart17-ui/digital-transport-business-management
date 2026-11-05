/**
 * The data notice shown before anyone uses the app (UC1 step 5). Change the
 * version whenever the text changes, so everyone is asked again. The server keeps
 * who agreed to which version and when.
 *
 * THIS TEXT IS A DRAFT and needs review by whoever is responsible for data
 * protection. Set NOTICE_IS_DRAFT to false only once it has been approved and the
 * blanks below are filled in.
 */
export const NOTICE_IS_DRAFT = true;
export const NOTICE_VERSION = 'draft-3';
export const CONSENT_SCOPE = 'data_notice';

export const NOTICE_SECTIONS: readonly { heading: string; body: string }[] = [
  {
    heading: 'What we collect',
    body: 'Your phone number and name, the business you belong to, the buses and agreements you are part of, odometer readings, and the takings, costs and payments you or your business record.',
  },
  {
    heading: 'Why we collect it',
    body: 'To sign you in, keep a shared record of each working day, work out who owes whom, and tell people when something needs their attention.',
  },
  {
    heading: 'Who can see it',
    body: 'The owner of your business can see the records of that business. A driver can see their own days and agreements. People in the same business can see each other’s names and phone numbers.',
  },
  {
    heading: 'Where it is kept',
    body: '[To be confirmed: the country where the data is stored.] Some of your entries are also saved on your phone until they can be sent.',
  },
  {
    heading: 'How long we keep it, and your choices',
    body: '[To be confirmed: how long records are kept, how to ask to see or correct your data, and who to contact.]',
  },
];
