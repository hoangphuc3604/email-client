import api from './client'

export interface SendEmailPayload {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
}

export interface ReplyEmailPayload {
  to: string
  subject: string
  body: string
}

export interface ModifyEmailPayload {
  unread?: boolean
  starred?: boolean
  labels?: string[]
  trash?: boolean
}

const mailApi = {
  async listMailboxes() {
    const res = await api.get('/mail/mailboxes')
    return res.data?.data || res.data || []
  },

  async listEmails(mailboxId: string) {
    const res = await api.get(`/mail/mailboxes/${mailboxId}/emails`)
    return res.data?.data || res.data || { threads: [], previews: [] }
  },

  async getEmail(emailId: string) {
    const res = await api.get(`/mail/emails/${emailId}`)
    return res.data?.data || res.data
  },

  async sendEmail(payload: SendEmailPayload) {
    const res = await api.post(`/mail/emails/send`, payload)
    return res.data?.data || res.data
  },

  async replyEmail(emailId: string, payload: ReplyEmailPayload) {
    const res = await api.post(`/mail/emails/${emailId}/reply`, payload)
    return res.data?.data || res.data
  },

  async modifyEmail(emailId: string, updates: ModifyEmailPayload) {
    const res = await api.post(`/mail/emails/${emailId}/modify`, updates)
    return res.data?.data || res.data
  },

  async searchEmails(query: string) {
    const res = await api.get(`/mail/search?q=${encodeURIComponent(query)}`)
    return res.data?.data || res.data
  },

  async downloadAttachment(messageId: string, attachmentId: string) {
    // Pass attachment ID as query parameter to avoid URL encoding issues
    const res = await api.get(`/mail/attachments`, {
      params: {
        attachmentId: attachmentId,
        messageId: messageId
      },
      responseType: 'blob',
      headers: {
        'Accept': 'application/octet-stream'
      }
    })
    return res.data
  },
}

export { mailApi }
export default mailApi
