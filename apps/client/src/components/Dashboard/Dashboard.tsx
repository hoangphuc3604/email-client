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
  FaEdit,
  FaTrash,
  FaSync,
  FaReply,
  FaForward,
  FaCheckSquare,
  FaEnvelopeOpen,
  FaEnvelope,
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
  const [masterEmails, setMasterEmails] = useState<any[]>([])
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null)
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [previewsMap, setPreviewsMap] = useState<Record<string, any[]>>({})
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [showCompose, setShowCompose] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  // canonical folder selection similar to server: critical system labels first, then user labels, then starred, then inbox, then archive
  function canonicalFolder(email: any) {
    const labels = (email.labels || []).map((l: string) => ('' + l).toLowerCase())
    const critical = ['trash', 'drafts', 'sent', 'spam']
    for (const p of critical) if (labels.includes(p)) return p
    // prefer user/custom labels (not the common system ones)
    const common = new Set(['inbox', 'sent', 'drafts', 'trash', 'archive', 'spam', 'starred'])
    for (const l of labels) if (!common.has(l)) return l
    if (labels.includes('starred')) return 'starred'
    if (labels.includes('inbox')) return 'inbox'
    return 'archive'
  }

  const emailList = useMemo(() => masterEmails.filter((e) => canonicalFolder(e) === selectedFolder), [masterEmails, selectedFolder])

  const unreadInboxCount = useMemo(() => {
    const inboxPreviews = previewsMap['inbox'] || []
    return inboxPreviews.filter((e: any) => e.unread === true).length
  }, [previewsMap])

  const displayList = useMemo(() => {
    return previewsMap[selectedFolder] || emailList
  }, [previewsMap, emailList, selectedFolder])

  function selectFolder(id: string) {
    setSelectedFolder(id)
    setSelectedEmail(null)
    setSelectedIds({})
    setCursorIndex(0)
    setMobileView('list')
    setLoading(true)
    // load folder previews from backend
    loadFolderEmails(id)
  }

  async function loadMailboxes() {
    setLoading(true)
    try {
      const data = await mailApi.listMailboxes()
      // data is array of {id,name,...}
      // Filter to only show essential system labels
      const essentialLabels = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH', 'SPAM']
      const filtered = (data || []).filter((box: any) => 
        essentialLabels.includes(String(box.id).toUpperCase())
      ).map((box: any) => ({
        ...box,
        id: String(box.id).toLowerCase(), // normalize to lowercase for UI
        unreadCount: box.unread_count || 0
      }))
      setMailboxes(filtered.length > 0 ? filtered : mockFolders)
      // load selected folder previews
      await loadFolderEmails(selectedFolder)
    } catch (e) {
      console.error('Error loading mailboxes:', e)
      // fallback to mock folders
      setMailboxes(mockFolders)
    } finally {
      setLoading(false)
    }
  }

  async function loadFolderEmails(folderId: string) {
    try {
      const res = await mailApi.listEmails(folderId)
      // server returns { threads, total, previews, ... } or fallback mock structure
      const previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : null)
      if (previews) {
        setPreviewsMap((prev) => ({ ...prev, [folderId]: previews }))
        // clear selection and cursor
        setSelectedIds({})
        setCursorIndex(0)
        // Auto-open first email when entering a new section
        if (previews.length > 0) {
          await openEmail(previews[0])
        }
        return
      }
    } catch (err) {
      console.error('Error loading folder emails:', err)
    } finally {
      setLoading(false)
    }
    // fallback: compute previews from masterEmails
    const fallback = masterEmails.filter((e) => canonicalFolder(e) === folderId).map((e) => ({ id: e.id, subject: e.subject, sender: e.sender, body: e.preview || '', attachments: e.attachments || [], unread: !e.read }))
    setPreviewsMap((prev) => ({ ...prev, [folderId]: fallback }))
    // Auto-open first email for fallback as well
    if (fallback.length > 0) {
      await openEmail(fallback[0])
    }
    setLoading(false)
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
        sender: senderStr,
        // Use processed_html if available, otherwise body
        body: message.processed_html || message.body || message.decoded_body || '',
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      })
      // mark as read locally in previewsMap
      setPreviewsMap((prev) => {
        const folderPreviews = prev[selectedFolder] || []
        const updated = folderPreviews.map((e: any) => 
          e.id === email.id ? { ...e, unread: false } : e
        )
        return { ...prev, [selectedFolder]: updated }
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
    setMobileView('detail')
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }))
  }

  function selectAllToggle() {
    const allSelected = emailList.length > 0 && emailList.every((e) => selectedIds[e.id])
    if (allSelected) setSelectedIds({})
    else setSelectedIds(Object.fromEntries(emailList.map((e) => [e.id, true])))
  }

  function deleteSelected() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    // move selected threads to trash via backend modify, fallback to local removal
    for (const id of Array.from(ids)) {
      try {
        mailApi.modifyEmail(id, { labels: ['trash'] })
      } catch (e) {
        // ignore
      }
    }
    setMasterEmails((prev) => prev.filter((e) => !ids.has(e.id)))
    if (selectedEmail && ids.has(selectedEmail.id)) setSelectedEmail(null)
    setSelectedIds({})
  }

  function markReadUnread(makeRead: boolean) {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    for (const id of Array.from(ids)) {
      try {
        mailApi.modifyEmail(id, { unread: !makeRead })
      } catch (e) {}
    }
    setMasterEmails((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, read: makeRead } : e)))
    setSelectedIds({})
  }

  function toggleStar(email: any) {
    const hasStar = (email.labels || []).includes('starred')
    const newLabels = hasStar ? (email.labels || []).filter((l: string) => l !== 'starred') : [...(email.labels || []), 'starred']
    // update backend
    try {
      mailApi.modifyEmail(email.id, { labels: newLabels })
    } catch (e) {}
    setMasterEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, labels: newLabels } : e)))
    // if current folder changed due to canonical mapping, refresh previews for affected folders
    setTimeout(() => { loadFolderEmails(selectedFolder); loadFolderEmails('starred') }, 50)
  }

  function refreshFolder() {
    // reload previews for current folder
    loadFolderEmails(selectedFolder)
    setSelectedEmail(null)
    setSelectedIds({})
  }

  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')

  async function sendCompose() {
    try {
      await mailApi.sendEmail({ to: composeTo, subject: composeSubject, body: composeBody })
      // refresh sent folder
      await loadFolderEmails('sent')
    } catch (e) {
      // fallback to local insert
      const item = {
        id: `m_${Date.now()}`,
        sender: 'You',
        subject: composeSubject || '(no subject)',
        preview: (composeBody || '').slice(0, 80),
        read: true,
        labels: ['sent'],
        timestamp: Date.now(),
        body: `<p>${composeBody}</p>`,
        attachments: [],
      }
      setMasterEmails((prev) => [item, ...prev])
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
        setCursorIndex((i) => Math.min(i + 1, emailList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursorIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const email = emailList[cursorIndex]
        if (email) openEmail(email)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emailList, cursorIndex, mobileView])

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
            <div className="folders-header d-flex align-items-center justify-content-between">
              <h5>Mailboxes</h5>
              <Button variant="link" size="sm" onClick={refreshFolder} aria-label="Refresh folders">
                <FaSync />
              </Button>
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
                        {String(f.id).toLowerCase() === 'draft' && <FaEdit className="me-2" />}
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
                        <div className="preview text-muted">{preview}</div>
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
                    <Button variant="outline-danger" size="sm" onClick={() => { deleteSelected() }}>
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
                      <h6>Attachments</h6>
                      <ul>
                        {selectedEmail.attachments.map((a: any, i: number) => (
                          <li key={i}><a href={a.url}>{a.name}</a> <small>({a.size})</small></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card.Body>
              </Card>
            )}
          </Col>
        </Row>
      </Container>

      <Modal show={showCompose} onHide={() => setShowCompose(false)}>
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
          <Button variant="secondary" onClick={() => setShowCompose(false)}>Cancel</Button>
          <Button variant="primary" onClick={sendCompose}>Send</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}