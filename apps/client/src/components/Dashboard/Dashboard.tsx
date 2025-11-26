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

const mockFolders = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'starred', name: 'Starred' },
  { id: 'sent', name: 'Sent' },
  { id: 'drafts', name: 'Drafts' },
  { id: 'archive', name: 'Archive' },
  { id: 'trash', name: 'Trash' },
]

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
      // data is array of {id,name,...}
      // Filter to only show essential system labels
      const essentialLabels = ['INBOX', 'STARRED', 'SENT', 'DRAFTS', 'ARCHIVE', 'TRASH']
      const filtered = (data || []).filter((box: any) => 
        essentialLabels.includes(String(box.id).toUpperCase())
      ).map((box: any) => ({
        ...box,
        id: String(box.id).toLowerCase(), // normalize to lowercase for UI
        unreadCount: box.unread_count || 0
      }))
      setMailboxes(filtered.length > 0 ? filtered : mockFolders)
      // Load ALL folders on initial load to populate previewsMap
      await loadAllFoldersInitial()
    } catch (e) {
      console.error('Error loading mailboxes:', e)
      // fallback to mock folders
      setMailboxes(mockFolders)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllFoldersInitial() {
    // Check if we have cached data - but always reload on mount to check for attachments
    // since attachment info might not be in the cache
    
    // For now, always do a fresh load to ensure attachments are properly checked
    // In the future, we could store attachment info in cache as well
    
    try {
      // Load all essential folders into previewsMap
      const folders = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'trash']
      const results = await Promise.all(
        folders.map(async (folderId) => {
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
      
      // First, process starred folder to get starred email IDs
      const starredResult = results.find(r => r.folderId === 'starred')
      const starredIds = new Set((starredResult?.previews || []).map((e: any) => e.id))
      
      // Ensure starred emails have the starred label
      if (starredResult) {
        newPreviewsMap['starred'] = starredResult.previews.map((e: any) => ({
          ...e,
          labels: [...new Set([...(e.labels || []), 'starred'])]
        }))
      }
      
      // Check inbox emails for attachments by fetching full details
      const inboxResult = results.find(r => r.folderId === 'inbox')
      const inboxWithAttachments: string[] = []
      const archiveResult = results.find(r => r.folderId === 'archive')
      const archiveEmails = [...(archiveResult?.previews || [])]
      
      if (inboxResult && inboxResult.previews.length > 0) {
        // Fetch full details for inbox emails to check attachments
        const detailChecks = await Promise.all(
          inboxResult.previews.map(async (preview: any) => {
            try {
              const detail = await mailApi.getEmail(preview.id)
              const message = detail.latest || detail.messages?.[0] || detail
              const hasAttachments = message.attachments && message.attachments.length > 0
              return { id: preview.id, hasAttachments, attachments: message.attachments, preview }
            } catch (e) {
              return { id: preview.id, hasAttachments: false, attachments: [], preview }
            }
          })
        )
        
        // Move emails with attachments to archive
        detailChecks.forEach(({ id, hasAttachments, attachments, preview }) => {
          if (hasAttachments && !starredIds.has(id)) {
            inboxWithAttachments.push(id)
            archiveEmails.push({
              ...preview,
              attachments,
              labels: [...new Set([...(preview.labels || []), 'archive'])]
            })
          }
        })
      }
      
      const attachmentIds = new Set(inboxWithAttachments)
      
      // Process other folders
      results.forEach(({ folderId, previews }) => {
        if (folderId === 'starred') return // Already processed
        
        if (folderId === 'inbox') {
          // Filter out starred emails and emails with attachments
          newPreviewsMap[folderId] = previews.filter((e: any) => !starredIds.has(e.id) && !attachmentIds.has(e.id))
        } else if (folderId === 'archive') {
          newPreviewsMap[folderId] = archiveEmails
        } else {
          newPreviewsMap[folderId] = previews
        }
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
      
      setSelectedEmail({
        ...message,
        id: email.id, // Keep the original preview ID for consistency
        sender: senderStr,
        // Use processed_html if available, otherwise body
        body: message.processed_html || message.body || message.decoded_body || '',
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      })
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

  function deleteSelected() {
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
    
    // Try backend, but work locally regardless
    for (const id of Array.from(ids)) {
      try {
        mailApi.modifyEmail(id, { labels: ['trash'] }).catch(() => {})
      } catch (e) {}
    }
    
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

  function downloadAttachment(attachment: any) {
    // Note: This is mock data - in production, this would fetch the actual file from the server
    // For now, show an alert explaining this is a demo
    alert(`Mock Attachment Download\n\nFilename: ${attachment.filename}\nSize: ${Math.round(attachment.size / 1024)} KB\nType: ${attachment.mime_type}\n\nNote: This is a demonstration with mock data. In a production environment, this would download the actual file from the server.`)
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

  function markReadUnread(makeRead: boolean) {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    
    // Try backend
    for (const id of Array.from(ids)) {
      try {
        mailApi.modifyEmail(id, { unread: !makeRead }).catch(() => {})
      } catch (e) {}
    }
    
    // Update locally in all folders
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

  function toggleStar(email: any) {
    const hasStar = (email.labels || []).includes('starred')
    
    // Try backend
    try {
      const newLabels = hasStar 
        ? (email.labels || []).filter((l: string) => l !== 'starred') 
        : [...(email.labels || []), 'starred']
      mailApi.modifyEmail(email.id, { labels: newLabels }).catch(() => {})
    } catch (e) {}
    
    // Update locally in previewsMap
    // Starred emails should ONLY appear in Starred folder, not in Inbox
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      
      if (hasStar) {
        // Unstar: move from starred back to inbox
        const starredEmail = (updated['starred'] || []).find((e: any) => e.id === email.id)
        if (starredEmail) {
          // Remove from starred folder
          updated['starred'] = (updated['starred'] || []).filter((e: any) => e.id !== email.id)
          
          // Add back to inbox with starred label removed
          const unstarredEmail = {
            ...starredEmail,
            labels: (starredEmail.labels || []).filter((l: string) => l !== 'starred')
          }
          updated['inbox'] = [unstarredEmail, ...(updated['inbox'] || [])]
        }
      } else {
        // Star: move from inbox to starred
        const inboxEmail = (updated['inbox'] || []).find((e: any) => e.id === email.id)
        if (inboxEmail) {
          // Remove from inbox
          updated['inbox'] = (updated['inbox'] || []).filter((e: any) => e.id !== email.id)
          
          // Add to starred folder with starred label
          const starredEmail = {
            ...inboxEmail,
            labels: [...new Set([...(inboxEmail.labels || []), 'starred'])]
          }
          updated['starred'] = [starredEmail, ...(updated['starred'] || [])]
        } else {
          // If not in inbox, still add to starred (could be from other folders)
          const emailToStar = { ...email, labels: [...new Set([...(email.labels || []), 'starred'])] }
          updated['starred'] = [emailToStar, ...(updated['starred'] || [])]
        }
      }
      
      return updated
    })
  }

  async function refreshFolder() {
    // Hard refresh: clear cache and reload from backend
    setLoading(true)
    try {
      // Clear localStorage cache
      localStorage.removeItem('email_previews_map')
      
      // Reload all folders
      const folders = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'trash']
      const results = await Promise.all(
        folders.map(async (folderId) => {
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
      
      // Process starred folder first
      const starredResult = results.find(r => r.folderId === 'starred')
      const starredIds = new Set((starredResult?.previews || []).map((e: any) => e.id))
      
      if (starredResult) {
        newPreviewsMap['starred'] = starredResult.previews.map((e: any) => ({
          ...e,
          labels: [...new Set([...(e.labels || []), 'starred'])]
        }))
      }
      
      // Check inbox emails for attachments by fetching full details
      const inboxResult = results.find(r => r.folderId === 'inbox')
      const inboxWithAttachments: string[] = []
      const archiveResult = results.find(r => r.folderId === 'archive')
      const archiveEmails = [...(archiveResult?.previews || [])]
      
      if (inboxResult && inboxResult.previews.length > 0) {
        // Fetch full details for inbox emails to check attachments
        const detailChecks = await Promise.all(
          inboxResult.previews.map(async (preview: any) => {
            try {
              const detail = await mailApi.getEmail(preview.id)
              const message = detail.latest || detail.messages?.[0] || detail
              const hasAttachments = message.attachments && message.attachments.length > 0
              return { id: preview.id, hasAttachments, attachments: message.attachments, preview }
            } catch (e) {
              return { id: preview.id, hasAttachments: false, attachments: [], preview }
            }
          })
        )
        
        // Move emails with attachments to archive
        detailChecks.forEach(({ id, hasAttachments, attachments, preview }) => {
          if (hasAttachments && !starredIds.has(id)) {
            inboxWithAttachments.push(id)
            archiveEmails.push({
              ...preview,
              attachments,
              labels: [...new Set([...(preview.labels || []), 'archive'])]
            })
          }
        })
      }
      
      const attachmentIds = new Set(inboxWithAttachments)
      
      // Process other folders
      results.forEach(({ folderId, previews }) => {
        if (folderId === 'starred') return
        
        if (folderId === 'inbox') {
          // Filter out starred emails and emails with attachments
          newPreviewsMap[folderId] = previews.filter((e: any) => !starredIds.has(e.id) && !attachmentIds.has(e.id))
        } else if (folderId === 'archive') {
          newPreviewsMap[folderId] = archiveEmails
        } else {
          newPreviewsMap[folderId] = previews
        }
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
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')

  function saveDraft() {
    // Only save if there's any content
    if (!composeTo && !composeSubject && !composeBody) return
    
    const draftEmail = {
      id: `draft_${Date.now()}`,
      sender: 'You',
      to: composeTo ? [{ email: composeTo }] : [],
      subject: composeSubject || '(no subject)',
      body: composeBody,
      preview: (composeBody || '').slice(0, 80) || '(Draft email)',
      read: true,
      unread: false,
      labels: ['drafts'],
      timestamp: Date.now(),
      attachments: [],
    }
    
    // Add to drafts folder
    setPreviewsMap((prev) => ({
      ...prev,
      drafts: [draftEmail, ...(prev['drafts'] || [])]
    }))
  }

  function handleCloseCompose() {
    saveDraft()
    setShowCompose(false)
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
  }

  async function sendCompose() {
    const sentEmail = {
      id: `m_${Date.now()}`,
      sender: 'You',
      subject: composeSubject || '(no subject)',
      body: composeBody,
      preview: (composeBody || '').slice(0, 80),
      read: true,
      unread: false,
      labels: ['sent'],
      timestamp: Date.now(),
      attachments: [],
    }
    
    // Add to sent folder immediately
    setPreviewsMap((prev) => ({
      ...prev,
      sent: [sentEmail, ...(prev['sent'] || [])]
    }))
    
    // Try to send via backend (but don't wait for it)
    try {
      mailApi.sendEmail({ to: composeTo, subject: composeSubject, body: composeBody }).catch(() => {})
    } catch (e) {
      console.error('Failed to send email:', e)
    }
    
    setShowCompose(false)
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
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

  useEffect(() => {
    loadMailboxes()
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
                      <div className="checkbox-col me-2">
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
                    <Button variant="outline-secondary" size="sm" onClick={() => { /* reply mock */ }}>
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

      <Modal show={showCompose} onHide={handleCloseCompose}>
        <Modal.Header closeButton>
          <Modal.Title>Compose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={6} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseCompose}>Cancel</Button>
          <Button variant="primary" onClick={sendCompose}>Send</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}