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

// CHUYỂN ĐỔI: Sử dụng endpoint mock-mail để test tính năng Kanban với dữ liệu giả
// Nếu muốn chạy với Gmail thật, hãy đổi thành '/mail'
const BASE_ENDPOINT = '/mail' 

const mailApi = {
  async listMailboxes() {
    // Lưu ý: Endpoint mock mailboxes là /mock-mail/mailboxes
    const res = await api.get(`${BASE_ENDPOINT}/mailboxes`)
    return res.data?.data || res.data || []
  },

  async listEmails(mailboxId: string, limit: number = 50, pageToken?: string) {
    const res = await api.get(`${BASE_ENDPOINT}/mailboxes/${mailboxId}/emails`, {
      params: { 
        limit,
        ...(pageToken && { page_token: pageToken })
      }
    })
    return res.data?.data || res.data || { threads: [], previews: [] }
  },

  async getEmail(emailId: string) {
    const res = await api.get(`${BASE_ENDPOINT}/emails/${emailId}`)
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
    
    const res = await api.post(`${BASE_ENDPOINT}/emails/send`, formData, {
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
    
    const res = await api.post(`${BASE_ENDPOINT}/emails/${emailId}/reply`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return res.data?.data || res.data
  },

  async modifyEmail(emailId: string, updates: ModifyEmailPayload) {
    // Gọi đến Mock API để cập nhật mock_data
    const res = await api.post(`${BASE_ENDPOINT}/emails/${emailId}/modify`, updates)
    return res.data?.data || res.data
  },

  async searchEmails(query: string) {
    const res = await api.get(`${BASE_ENDPOINT}/search?q=${encodeURIComponent(query)}`)
    return res.data?.data || res.data
  },

  async downloadAttachment(messageId: string, attachmentId: string) {
    // Pass attachment ID as query parameter to avoid URL encoding issues
    const res = await api.get(`${BASE_ENDPOINT}/attachments`, {
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
    
    // Lưu ý: Mock API có thể chưa có endpoint drafts, fallback về mail thật nếu cần
    // Nhưng tạm thời để mock cho đồng bộ
    const res = await api.post(`${BASE_ENDPOINT}/drafts`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return res.data?.data || res.data
  },


  async snoozeEmail(emailId: string, snoozeUntil: string) {
    // snoozeUntil phải là ISO string
    const res = await api.post(`${BASE_ENDPOINT}/emails/${emailId}/snooze`, {
      snooze_until: snoozeUntil
    })
    return res.data?.data || res.data
  },

  async summarizeEmail(emailId: string) {
    const res = await api.post(`${BASE_ENDPOINT}/emails/${emailId}/summarize`)
    return res.data?.data || res.data
  },
}

export { mailApi }
export default mailApi