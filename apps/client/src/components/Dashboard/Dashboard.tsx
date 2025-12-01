import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Container,
  Row,
  Col,
  ListGroup,
  Card,
  Button,
  Badge,
  Modal,
  Form,
} from 'react-bootstrap'
import Particle from '../Particle'
import './Dashboard.css'
import mailApi from '../../api/mail'
import {
  FaInbox,
  FaStar,
  FaRegStar,
  FaPaperPlane,
  FaTrash,
  FaSync,
  FaReply,
  FaForward,
  FaCheckSquare,
  FaEnvelopeOpen,
  FaEnvelope,
  FaFileArchive,
  FaPencilAlt,
  FaDownload,
} from 'react-icons/fa'
import { BiEdit } from 'react-icons/bi'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'

// Map Gmail label IDs to friendly names
const LABEL_NAME_MAP: Record<string, string> = {
  'INBOX': 'Inbox',
  'STARRED': 'Starred',
  'SENT': 'Sent',
  'DRAFT': 'Drafts',
  'TRASH': 'Trash',
}

// Gmail system labels we want to display
const ESSENTIAL_LABELS = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH']

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function Dashboard() {
  const [selectedFolder, setSelectedFolder] = useState('inbox')
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null)
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [previewsMap, setPreviewsMap] = useState<Record<string, any[]>>(() => {
    // Load from localStorage on mount
    try {
      const saved = localStorage.getItem('email_previews_map')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [showCompose, setShowCompose] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Save previewsMap to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('email_previews_map', JSON.stringify(previewsMap))
    } catch (e) {
      console.error('Failed to save email state:', e)
    }
  }, [previewsMap])

  const displayList = useMemo(() => {
    return previewsMap[selectedFolder] || []
  }, [previewsMap, selectedFolder])

  const unreadInboxCount = useMemo(() => {
    const inboxPreviews = previewsMap['inbox'] || []
    return inboxPreviews.filter((e: any) => e.unread === true).length
  }, [previewsMap])

  function selectFolder(id: string) {
    setSelectedFolder(id)
    setSelectedEmail(null)
    setSelectedIds({})
    setCursorIndex(0)
    setMobileView('list')
    // Don't reload from backend - just switch to cached folder
  }

  async function loadMailboxes() {
    setLoading(true)
    try {
      const data = await mailApi.listMailboxes()
      // Filter to only show essential system labels (Gmail standard labels)
      const filtered = (data || []).filter((box: any) => 
        ESSENTIAL_LABELS.includes(String(box.id).toUpperCase())
      ).map((box: any) => ({
        ...box,
        id: String(box.id).toLowerCase(), // normalize to lowercase for UI
        name: LABEL_NAME_MAP[String(box.id).toUpperCase()] || box.name,
        unreadCount: box.unread_count || 0
      }))
      setMailboxes(filtered.length > 0 ? filtered : [])
      // Load ALL folders on initial load to populate previewsMap
      await loadAllFoldersInitial(filtered.map((f: { id: any }) => f.id))
    } catch (e) {
      console.error('Error loading mailboxes:', e)
      setMailboxes([])
    } finally {
      setLoading(false)
    }
  }

  async function loadAllFoldersInitial(folderIds: string[]) {
    // Load all Gmail folders into previewsMap
    try {
      const results = await Promise.all(
        folderIds.map(async (folderId) => {
          try {
            const res = await mailApi.listEmails(folderId)
            const previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
            return { folderId, previews }
          } catch (e) {
            return { folderId, previews: [] }
          }
        })
      )
      
      const newPreviewsMap: Record<string, any[]> = {}
      
      // Process each folder
      results.forEach(({ folderId, previews }) => {
        newPreviewsMap[folderId] = previews
      })
      
      setPreviewsMap(newPreviewsMap)
    } catch (err) {
      console.error('Error loading folders:', err)
    }
  }

  async function openEmail(email: any) {
    setLoadingEmail(true)
    // fetch full thread/detail from backend
    try {
      const data = await mailApi.getEmail(email.id)
      console.log('Email detail response:', data)
      // Backend returns { messages: [...], latest: {...}, ... }
      // Use the latest message for display, or first message if no latest
      const message = data.latest || data.messages?.[0] || data
      const senderStr = typeof message.sender === 'string' 
        ? message.sender 
        : (message.sender?.name || message.sender?.email || 'Unknown')
      
      // Find the actual message ID - it could be in different places
      const actualMessageId = message.id || message.message_id || email.id
      console.log('Message IDs:', { 
        messageId: message.id, 
        message_id: message.message_id, 
        emailId: email.id,
        actualMessageId,
        attachments: message.attachments 
      })
      
      setSelectedEmail({
        ...message,
        id: email.id, // Keep the original preview ID for consistency
        messageId: actualMessageId, // Store the actual message ID for attachments
        sender: senderStr,
        // Use processed_html if available, otherwise body
        body: message.processed_html || message.body || message.decoded_body || '',
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      })
      
      // Mark as read on backend if it was unread
      if (email.unread) {
        try {
          await mailApi.modifyEmail(email.id, { unread: false })
        } catch (e) {
          console.error('Failed to mark email as read on backend:', e)
        }
      }
    } catch (err) {
      console.error('Error loading email:', err)
      // fallback to using the preview item as detail
      const senderStr = typeof email.sender === 'string'
        ? email.sender
        : (email.sender?.name || email.sender?.email || 'Unknown')
      setSelectedEmail({
        ...email,
        sender: senderStr,
        body: email.body || email.preview || '',
        to: []
      })
    } finally {
      setLoadingEmail(false)
    }
    
    // Mark as read locally by updating in all folders
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        updated[folder] = updated[folder].map((e: any) => 
          e.id === email.id ? { ...e, unread: false, read: true } : e
        )
      })
      return updated
    })
    
    // Check if this is a draft email and open compose instead
    if (selectedFolder === 'drafts' || (email.labels && email.labels.includes('drafts'))) {
      // Load draft into compose form
      setComposeTo(email.to?.[0]?.email || '')
      setComposeSubject(email.subject || '')
      setComposeBody(email.body || email.preview || '')
      setShowCompose(true)
      
      // Remove draft from drafts folder since we're editing it
      setPreviewsMap((prev) => ({
        ...prev,
        drafts: (prev['drafts'] || []).filter((e: any) => e.id !== email.id)
      }))
      
      return // Don't set selectedEmail for drafts
    }
    
    setMobileView('detail')
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }))
  }

  function selectAllToggle() {
    const allSelected = displayList.length > 0 && displayList.every((e) => selectedIds[e.id])
    if (allSelected) setSelectedIds({})
    else setSelectedIds(Object.fromEntries(displayList.map((e) => [e.id, true])))
  }

  async function deleteSelected() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    
    // Check if we're deleting from trash - if so, permanently delete
    if (selectedFolder === 'trash') {
      // Permanently delete from system
      setPreviewsMap((prev) => {
        const updated = { ...prev }
        // Remove from all folders permanently
        Object.keys(updated).forEach(folder => {
          updated[folder] = updated[folder].filter((e: any) => !ids.has(String(e.id)))
        })
        return updated
      })
      
      if (selectedEmail && ids.has(String(selectedEmail.id))) setSelectedEmail(null)
      setSelectedIds({})
      return
    }
    
    // Call backend API for each selected email to move to trash
    const promises = Array.from(ids).map(id => 
      mailApi.modifyEmail(id, { trash: true })
        .catch(err => console.error(`Failed to delete email ${id}:`, err))
    )
    
    // Wait for all backend calls to complete (fire and forget style)
    Promise.all(promises).catch(() => {})
    
    // Move emails to trash locally by updating previewsMap
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      const movedEmails: any[] = []
      
      // Remove from current folder and collect emails
      Object.keys(updated).forEach(folder => {
        const emails = updated[folder]
        const remaining: any[] = []
        emails.forEach((e: any) => {
          if (ids.has(String(e.id))) {
            movedEmails.push({ ...e, labels: ['trash'] })
          } else {
            remaining.push(e)
          }
        })
        updated[folder] = remaining
      })
      
      // Add to trash folder
      updated['trash'] = [...(updated['trash'] || []), ...movedEmails]
      
      return updated
    })
    
    if (selectedEmail && ids.has(String(selectedEmail.id))) setSelectedEmail(null)
    setSelectedIds({})
  }

  async function downloadAttachment(attachment: any) {
    // Download attachment from backend
    if (!selectedEmail) return
    
    console.log('Full attachment object:', attachment)
    console.log('Selected email:', { 
      id: selectedEmail.id, 
      messageId: selectedEmail.messageId,
      attachments: selectedEmail.attachments 
    })
    
    // Get the correct attachment ID - could be attachment_id or attachmentId
    const attachmentId = attachment.attachment_id || attachment.attachmentId
    
    if (!attachmentId) {
      console.error('Attachment ID is missing:', attachment)
      alert('Cannot download attachment: ID is missing. Please try refreshing the email.')
      return
    }
    
    // Use the message ID from the attachment itself (most accurate)
    // Fallback to selectedEmail's messageId, then email id
    const messageId = attachment.messageId || attachment.message_id || selectedEmail.messageId || selectedEmail.id
    
    if (!messageId) {
      console.error('Message ID is missing from attachment and selectedEmail')
      alert('Cannot download attachment: Message ID is missing. Please try refreshing the email.')
      return
    }
    
    try {
      console.log('Downloading attachment:', { messageId, attachmentId, filename: attachment.filename || attachment.name })
      // Get the blob from the backend
      const blob = await mailApi.downloadAttachment(messageId, attachmentId)
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob)
      
      // Create a temporary link element and trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.filename || attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      
      // Clean up
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download attachment:', error)
      alert('Failed to download attachment. Please try again.')
    }
  }

  function deleteCurrentEmail() {
    if (!selectedEmail) return
    
    const emailId = String(selectedEmail.id)
    console.log('Deleting email with ID:', emailId, 'from folder:', selectedFolder)
    
    // Check if we're deleting from trash - if so, permanently delete
    if (selectedFolder === 'trash') {
      // Permanently delete from system
      setPreviewsMap((prev) => {
        const updated = { ...prev }
        // Remove from all folders permanently
        Object.keys(updated).forEach(folder => {
          updated[folder] = updated[folder].filter((e: any) => String(e.id) !== emailId)
        })
        return updated
      })
      
      setSelectedEmail(null)
      setMobileView('list')
      return
    }
    
    // Try backend
    try {
      mailApi.modifyEmail(emailId, { labels: ['trash'] }).catch(() => {})
    } catch (e) {}
    
    // Move email to trash locally - same logic as deleteSelected
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      const movedEmails: any[] = []
      
      console.log('Before delete, folders:', Object.keys(updated))
      console.log('Inbox before:', updated['inbox']?.map((e: any) => e.id))
      
      // Remove from all folders and collect the email
      Object.keys(updated).forEach(folder => {
        const emails = updated[folder] || []
        const remaining: any[] = []
        emails.forEach((e: any) => {
          if (String(e.id) === emailId) {
            console.log(`Found email ${emailId} in folder ${folder}`)
            movedEmails.push({ ...e, labels: ['trash'] })
          } else {
            remaining.push(e)
          }
        })
        updated[folder] = remaining
      })
      
      console.log('Moved emails:', movedEmails.length)
      console.log('Inbox after:', updated['inbox']?.map((e: any) => e.id))
      
      // Add to trash folder
      updated['trash'] = [...(updated['trash'] || []), ...movedEmails]
      
      return updated
    })
    
    setSelectedEmail(null)
    setMobileView('list')
  }

  async function markReadUnread(makeRead: boolean) {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    
    // Call backend API for each selected email
    const promises = Array.from(ids).map(id => 
      mailApi.modifyEmail(id, { unread: !makeRead })
        .catch(err => console.error(`Failed to mark email ${id} as ${makeRead ? 'read' : 'unread'}:`, err))
    )
    
    // Wait for all backend calls to complete (fire and forget style)
    Promise.all(promises).catch(() => {})
    
    // Update locally in all folders immediately for UI responsiveness
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        updated[folder] = updated[folder].map((e: any) => 
          ids.has(String(e.id)) ? { ...e, unread: !makeRead, read: makeRead } : e
        )
      })
      return updated
    })
    
    setSelectedIds({})
  }
  
  async function toggleStar(email: any) {
    const hasStar = (email.labels || []).includes('starred') || (email.labels || []).includes('STARRED')
    
    // Call backend API in background
    try {
      await mailApi.modifyEmail(email.id, { starred: !hasStar })
      console.log(`Successfully ${hasStar ? 'unstarred' : 'starred'} email ${email.id}`)
      
      // Refresh the current folder to show updated starred status
      await refreshFolder()
    } catch (e) {
      console.error('Failed to toggle star on backend:', e)
      alert('Failed to update star status')
    }
  }
  
  async function refreshFolder() {
    // Hard refresh: clear cache and reload from backend
    setLoading(true)
    try {
      // Clear localStorage cache
      localStorage.removeItem('email_previews_map')
      
      // Reload all folders (from the current mailboxes state)
      const folderIds = mailboxes.map(m => m.id)
      const results = await Promise.all(
        folderIds.map(async (folderId) => {
          try {
            const res = await mailApi.listEmails(folderId)
            const previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
            return { folderId, previews }
          } catch (e) {
            return { folderId, previews: [] }
          }
        })
      )
      
      const newPreviewsMap: Record<string, any[]> = {}
      
      // Process each folder
      results.forEach(({ folderId, previews }) => {
        newPreviewsMap[folderId] = previews
      })
      
      setPreviewsMap(newPreviewsMap)
    } catch (err) {
      console.error('Error refreshing folder:', err)
    } finally {
      setLoading(false)
    }
    setSelectedEmail(null)
    setSelectedIds({})
  }

  const [composeTo, setComposeTo] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeBcc, setComposeBcc] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeAttachments, setComposeAttachments] = useState<File[]>([])
  const [showCcBcc, setShowCcBcc] = useState(false)
  
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<File[]>([])
  const [replyingToId, setReplyingToId] = useState<string | null>(null)

  function handleReply(email: any) {
    console.log('[Reply] Opening reply modal for email:', email?.id, email)
    
    // Populate reply fields
    const senderEmail = typeof email.sender === 'string' 
      ? email.sender 
      : (email.sender?.email || 'unknown@example.com')
    
    setReplyTo(senderEmail)
    setReplySubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(no subject)'}`)
    setReplyBody(`\n\n--- Original Message ---\nFrom: ${email.sender}\nSubject: ${email.subject || '(no subject)'}\n\n`)
    setReplyingToId(email.id)
    setShowReply(true)
    
    console.log('[Reply] Modal should now be visible. showReply:', true)
  }

  function handleCloseReply() {
    if (replyBody && replyBody.trim() && !confirm('Discard this reply?')) {
      return
    }
    setShowReply(false)
    setReplyTo('')
    setReplySubject('')
    setReplyBody('')
    setReplyAttachments([])
    setReplyingToId(null)
  }

  async function sendReply() {
    if (!replyTo || !replyTo.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    
    if (!replyingToId) {
      alert('Error: Original email ID is missing')
      return
    }
    
    try {
      // Use the reply API endpoint instead of send
      await mailApi.replyEmail(replyingToId, {
        to: replyTo,
        subject: replySubject || '(no subject)',
        body: replyBody,
        attachments: replyAttachments.length > 0 ? replyAttachments : undefined
      })
      
      setShowReply(false)
      setReplyTo('')
      setReplySubject('')
      setReplyBody('')
      setReplyAttachments([])
      setReplyingToId(null)
      
      await refreshFolder()
      
      alert('Reply sent successfully!')
    } catch (e: any) {
      console.error('Failed to send reply:', e)
      alert(`Failed to send reply: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
    }
  }

  function handleCloseCompose() {
    // Check if there's unsaved content
    if (composeTo || composeCc || composeBcc || composeSubject || composeBody || composeAttachments.length > 0) {
      if (!confirm('Discard this draft?')) {
        return
      }
    }
    
    setShowCompose(false)
    setComposeTo('')
    setComposeCc('')
    setComposeBcc('')
    setComposeSubject('')
    setComposeBody('')
    setComposeAttachments([])
    setShowCcBcc(false)
  }

  async function sendCompose() {
    if (!composeTo || !composeTo.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    
    try {
      // Actually send via Gmail API and wait for response
      await mailApi.sendEmail({ 
        to: composeTo, 
        cc: composeCc || undefined,
        bcc: composeBcc || undefined,
        subject: composeSubject || '(no subject)', 
        body: composeBody,
        attachments: composeAttachments.length > 0 ? composeAttachments : undefined
      })
      
      // Close compose window after successful send
      setShowCompose(false)
      setComposeTo('')
      setComposeCc('')
      setComposeBcc('')
      setComposeSubject('')
      setComposeBody('')
      setComposeAttachments([])
      setShowCcBcc(false)
      
      // Silently refresh in background
      await refreshFolder()
      
      alert('Email sent successfully!')
    } catch (e: any) {
      console.error('Failed to send email:', e)
      alert(`Failed to send email: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mobileView === 'detail') return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursorIndex((i) => Math.min(i + 1, displayList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursorIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const email = displayList[cursorIndex]
        if (email) openEmail(email)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayList, cursorIndex, mobileView])

  useEffect(() => {
    const id = displayList[cursorIndex]?.id
    if (!id) return
    const el = document.getElementById(`email-row-${id}`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [cursorIndex, displayList])

  const hasLoadedRef = useRef(false)
  
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      loadMailboxes()
    }
  }, [])

  return (
    <Container fluid className="dashboard-section">
      <Particle />
      <Container className="dashboard-container">
        <Row className="dashboard-row">
          <Col md={2} className={`folder-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
            <div className="folders-header">
              <h5>Mailboxes</h5>
            </div>

            <ListGroup variant="flush" className="folders-list">
              {loading ? (
                <div className="text-center p-3">
                  <FaSync className="fa-spin" /> Loading...
                </div>
              ) : (
                mailboxes.map((f: any) => (
                  <ListGroup.Item key={f.id} action active={f.id === selectedFolder} onClick={() => selectFolder(f.id)}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        {String(f.id).toLowerCase() === 'inbox' && <FaInbox className="me-2" />}
                        {String(f.id).toLowerCase() === 'starred' && <FaStar className="me-2" />}
                        {String(f.id).toLowerCase() === 'sent' && <FaPaperPlane className="me-2" />}
                        {String(f.id).toLowerCase() === 'drafts' && <FaPencilAlt className="me-2" />}
                        {String(f.id).toLowerCase() === 'archive' && <FaFileArchive className="me-2" />}
                        {String(f.id).toLowerCase() === 'trash' && <FaTrash className="me-2" />}
                        {f.name}
                      </div>
                      {String(f.id).toLowerCase() === 'inbox' && unreadInboxCount > 0 && (
                        <Badge bg="danger">{unreadInboxCount}</Badge>
                      )}
                    </div>
                  </ListGroup.Item>
                ))
              )}
            </ListGroup>
          </Col>

          <Col md={4} className={`email-list-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
            <div className="email-list-actions d-flex align-items-center mb-2 gap-2">
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Compose</Tooltip>}>
                <Button variant="primary" onClick={() => setShowCompose(true)} aria-label="Compose">
                  <BiEdit />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Refresh</Tooltip>}>
                <Button variant="light" onClick={refreshFolder} aria-label="Refresh">
                  <FaSync />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Select All</Tooltip>}>
                <Button variant="outline-secondary" onClick={selectAllToggle} aria-label="Select all">
                  <FaCheckSquare />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Delete</Tooltip>}>
                <Button variant="outline-danger" onClick={deleteSelected} aria-label="Delete selected">
                  <FaTrash />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Mark as Read</Tooltip>}>
                <Button variant="outline-secondary" onClick={() => markReadUnread(true)} aria-label="Mark read">
                  <FaEnvelopeOpen />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Mark as Unread</Tooltip>}>
                <Button variant="outline-secondary" onClick={() => markReadUnread(false)} aria-label="Mark unread">
                  <FaEnvelope />
                </Button>
              </OverlayTrigger>
            </div>

            <div className="email-list" ref={listRef}>
              {loading ? (
                <div className="text-center p-5">
                  <FaSync className="fa-spin" size={32} />
                  <p className="mt-3">Loading emails...</p>
                </div>
              ) : (
              <ListGroup variant="flush">
                {displayList.map((email: any, idx: number) => {
                  const id = email.id
                  const isRead = ('read' in email) ? !!email.read : (email.unread === false)
                  const sender = (email.sender && (email.sender.name || email.sender.email)) ? (email.sender.name || email.sender.email) : (email.sender || '')
                  const subject = email.subject || ''
                  const preview = email.body || email.preview || ''
                  const ts = email.timestamp || (email.receivedOn ? Date.parse(email.receivedOn) : Date.now())
                  const isStarred = ((email.labels || email.tags) || []).includes('starred')
                  return (
                    <ListGroup.Item
                      id={`email-row-${id}`}
                      key={id}
                      action
                      className={`email-row d-flex align-items-start ${isRead ? 'read' : 'unread'} ${cursorIndex === idx ? 'cursor' : ''}`}
                      onClick={() => { setCursorIndex(idx); openEmail(email) }}
                    >
                      <div className="checkbox-col me-2" onClick={(e) => e.stopPropagation()}>
                        <Form.Check type="checkbox" checked={!!selectedIds[id]} onChange={() => toggleSelect(id)} />
                      </div>
                      <div className="star-col me-2" onClick={(e) => { e.stopPropagation(); toggleStar(email) }}>
                        {isStarred ? <FaStar /> : <FaRegStar />}
                      </div>
                      <div className="meta-col flex-fill">
                        <div className="row-top d-flex justify-content-between">
                          <div className="sender">{sender}</div>
                          <div className="time">{timeAgo(ts)}</div>
                        </div>
                        <div className="subject">{subject}</div>
                        <div className="preview">{preview}</div>
                      </div>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
              )}
            </div>
          </Col>

          <Col md={6} className={`email-detail-column ${mobileView === 'list' ? 'hide-on-mobile' : ''}`}>
            {loadingEmail ? (
              <div className="text-center mt-5">
                <FaSync className="fa-spin" size={48} />
                <p className="mt-3">Loading email...</p>
              </div>
            ) : !selectedEmail ? (
              <div className="empty-state text-center mt-5">
                <FaInbox size={48} />
                <p>Select an email to view details</p>
              </div>
            ) : (
              <Card className="email-detail-card">
                <Card.Header className="d-flex align-items-center">
                  <div className="me-2">
                    <Button variant="outline-secondary" size="sm" onClick={() => handleReply(selectedEmail)}>
                      <FaReply />
                    </Button>
                    <Button variant="outline-secondary" size="sm" className="ms-1" onClick={() => { /* forward mock */ }}>
                      <FaForward />
                    </Button>
                  </div>
                  <div className="ms-auto d-flex align-items-center">
                    <Button variant="outline-secondary" size="sm" onClick={() => { setSelectedEmail(null); setMobileView('list') }} className="me-2">
                      Back
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={deleteCurrentEmail}>
                      <FaTrash />
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Card.Title>{selectedEmail.subject}</Card.Title>
                  <Card.Subtitle className="mb-2 text-muted">
                    <div><strong>From:</strong> {selectedEmail.sender}</div>
                    {selectedEmail.to && selectedEmail.to.length > 0 && (
                      <div><strong>To:</strong> {selectedEmail.to.map((t: any) => t.name || t.email).join(', ')}</div>
                    )}
                    {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                      <div><strong>Cc:</strong> {selectedEmail.cc.map((c: any) => c.name || c.email).join(', ')}</div>
                    )}
                  </Card.Subtitle>
                  <hr />
                  <div className="email-body-container">
                    <iframe
                      ref={(iframe) => {
                        if (iframe) {
                          const resizeIframe = () => {
                            try {
                              const doc = iframe.contentDocument || iframe.contentWindow?.document
                              if (doc && doc.body) {
                                const height = doc.body.scrollHeight
                                iframe.style.height = Math.max(height + 32, 300) + 'px'
                              }
                            } catch (e) {
                              // ignore cross-origin errors
                            }
                          }
                          iframe.onload = resizeIframe
                          setTimeout(resizeIframe, 100)
                        }
                      }}
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <style>
                              body {
                                margin: 0;
                                padding: 16px;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
                                font-size: 14px;
                                line-height: 1.5;
                                color: #333;
                                background: transparent;
                                word-wrap: break-word;
                                overflow-wrap: break-word;
                              }
                              img { max-width: 100%; height: auto; }
                              a { color: #0066cc; }
                              pre { white-space: pre-wrap; }
                              table { border-collapse: collapse; }
                            </style>
                          </head>
                          <body>${selectedEmail.body}</body>
                        </html>
                      `}
                      style={{
                        width: '100%',
                        minHeight: '300px',
                        border: 'none',
                        backgroundColor: 'white',
                        display: 'block'
                      }}
                      sandbox="allow-same-origin"
                      title="Email content"
                    />
                  </div>

                  {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                    <div className="attachments mt-3">
                      <h6>Attachments ({selectedEmail.attachments.length})</h6>
                      <div className="d-flex flex-wrap gap-2">
                        {selectedEmail.attachments.map((a: any, i: number) => (
                          <Button
                            key={i}
                            variant="outline-primary"
                            size="sm"
                            onClick={() => downloadAttachment(a)}
                            className="d-flex align-items-center"
                          >
                            <FaDownload className="me-2" />
                            {a.filename || a.name}
                            <small className="ms-2 text-muted">({Math.round((a.size || 0) / 1024)} KB)</small>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card.Body>
              </Card>
            )}
          </Col>
        </Row>
      </Container>

      <Modal show={showCompose} onHide={handleCloseCompose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Compose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@example.com" />
            </Form.Group>
            
            {!showCcBcc && (
              <div className="mb-2">
                <Button variant="link" size="sm" onClick={() => setShowCcBcc(true)}>+ Add Cc/Bcc</Button>
              </div>
            )}
            
            {showCcBcc && (
              <>
                <Form.Group className="mb-2">
                  <Form.Label>Cc</Form.Label>
                  <Form.Control value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="Optional" />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>Bcc</Form.Label>
                  <Form.Control value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} placeholder="Optional" />
                </Form.Group>
              </>
            )}
            
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={8} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Attachments</Form.Label>
              <Form.Control 
                type="file" 
                multiple 
                onChange={(e: any) => {
                  const files = Array.from(e.target.files || [])
                  setComposeAttachments(files as File[])
                }}
              />
              {composeAttachments.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {composeAttachments.length} file(s) selected: {composeAttachments.map(f => f.name).join(', ')}
                  </small>
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseCompose}>Cancel</Button>
          <Button variant="primary" onClick={sendCompose}>Send</Button>
        </Modal.Footer>
      </Modal>
      
      <Modal show={showReply} onHide={handleCloseReply} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Reply</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={replyTo} onChange={(e) => setReplyTo(e.target.value)} readOnly />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={replySubject} onChange={(e) => setReplySubject(e.target.value)} readOnly />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={8} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Attachments</Form.Label>
              <Form.Control 
                type="file" 
                multiple 
                onChange={(e: any) => {
                  const files = Array.from(e.target.files || [])
                  setReplyAttachments(files as File[])
                }}
              />
              {replyAttachments.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {replyAttachments.length} file(s) selected: {replyAttachments.map(f => f.name).join(', ')}
                  </small>
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseReply}>Cancel</Button>
          <Button variant="primary" onClick={sendReply}>Send Reply</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}