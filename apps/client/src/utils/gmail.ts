export const getGmailMessageUrl = (messageId: string) =>
  `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

export const getGmailThreadUrl = (threadId: string) =>
  `https://mail.google.com/mail/u/0/#all/${threadId}`;
