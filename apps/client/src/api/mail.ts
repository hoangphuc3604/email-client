import api from './client'

export interface SendEmailPayload {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  attachments?: File[]
}

export interface ReplyEmailPayload {
  to: string
  subject: string
  body: string
  attachments?: File[]
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

  async listEmails(mailboxId: string, limit: number = 50) {
    const res = await api.get(`/mail/mailboxes/${mailboxId}/emails`, {
      params: { limit }
    })
    return res.data?.data || res.data || { threads: [], previews: [] }
  },

  async getEmail(emailId: string) {
    const res = await api.get(`/mail/emails/${emailId}`)
    return res.data?.data || res.data
  },

  async sendEmail(payload: SendEmailPayload) {
    // Backend expects FormData, not JSON
    const formData = new FormData()
    formData.append('to', payload.to)
    formData.append('subject', payload.subject)
    formData.append('body', payload.body)
    if (payload.cc) formData.append('cc', payload.cc)
    if (payload.bcc) formData.append('bcc', payload.bcc)
    
    // Add attachments if provided
    if (payload.attachments && payload.attachments.length > 0) {
      payload.attachments.forEach((file) => {
        formData.append('attachments', file)
      })
    }
    
    const res = await api.post(`/mail/emails/send`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return res.data?.data || res.data
  },

  async replyEmail(emailId: string, payload: ReplyEmailPayload) {
    // Backend expects FormData, not JSON
    const formData = new FormData()
    formData.append('to', payload.to)
    formData.append('subject', payload.subject)
    formData.append('body', payload.body)
    
    // Add attachments if provided
    if (payload.attachments && payload.attachments.length > 0) {
      payload.attachments.forEach((file) => {
        formData.append('attachments', file)
      })
    }
    
    const res = await api.post(`/mail/emails/${emailId}/reply`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
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

  async createDraft(payload: SendEmailPayload) {
    // Backend expects FormData, not JSON
    const formData = new FormData()
    formData.append('to', payload.to)
    formData.append('subject', payload.subject)
    formData.append('body', payload.body)
    if (payload.cc) formData.append('cc', payload.cc)
    if (payload.bcc) formData.append('bcc', payload.bcc)
    
    // Add attachments if provided
    if (payload.attachments && payload.attachments.length > 0) {
      payload.attachments.forEach((file) => {
        formData.append('attachments', file)
      })
    }
    
    const res = await api.post(`/mail/drafts`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return res.data?.data || res.data
  },
}

export { mailApi }
export default mailApi
