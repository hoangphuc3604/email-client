// apps/client/src/components/Navbar.tsx

import { useState, useEffect, useRef } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import logo from "../../public/logo-title.svg";
import { Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom'
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import ListGroup from "react-bootstrap/ListGroup"; // [NEW] For suggestion list
import Offcanvas from "react-bootstrap/Offcanvas"; // [NEW]
import Button from "react-bootstrap/Button";       // [NEW]

import { ImBlog } from "react-icons/im";
import {
  AiOutlineFundProjectionScreen,
  AiOutlineUser,
  AiOutlineLogout,
  AiOutlineSearch,
} from "react-icons/ai";
import useAuthStore from '../store/authStore'
import { useLogout } from '../hooks/useAuth'

import mailApi from "../api/mail"; // [NEW] Import API
// [NEW] Folder icons
import { 
  FaInbox, FaStar, FaPaperPlane, FaPen, FaBan, 
  FaExclamationTriangle, FaFileArchive, FaTrash, 
  FaTasks, FaClock, FaCheckSquare, FaFolder, FaBars   // [NEW] FaBars
} from 'react-icons/fa';

// [NEW] Map icons giống Dashboard
const getIconForFolder = (id: string) => {
  const lowerId = String(id || '').toLowerCase();
  switch (lowerId) {
    case 'inbox': return <FaInbox className="me-2" />;
    case 'starred': return <FaStar className="me-2" />;
    case 'sent': return <FaPaperPlane className="me-2" />;
    case 'draft': 
    case 'drafts': return <FaPen className="me-2" />;
    case 'spam': return <FaBan className="me-2" />;
    case 'important': return <FaExclamationTriangle className="me-2" />;
    case 'archive': return <FaFileArchive className="me-2" />;
    case 'trash': return <FaTrash className="me-2" />;
    case 'todo': return <FaTasks className="me-2" />;
    case 'snoozed': return <FaClock className="me-2" />;
    case 'done': return <FaCheckSquare className="me-2" />;
    default: return <FaFolder className="me-2" />;
  }
};
import { useSearch } from '../contexts/SearchContext'; // [NEW] Import API


function NavBar() {
  const [expand, updateExpanded] = useState(false);
  const [navColour, updateNavbar] = useState(false);


  // [NEW] Track mobile viewport to adjust UI
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  
  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]); // [NEW] Store suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // [NEW] Toggle dropdown

  const { searchResults, lastSearchQuery, setSelectedEmail } = useSearch();

  console.log('Navbar render - searchQuery:', searchQuery, 'showSuggestions:', showSuggestions, 'suggestions.length:', suggestions.length);

  // Sync searchQuery with lastSearchQuery for suggestions
  useEffect(() => {
    if (lastSearchQuery && !searchQuery) {
      setSearchQuery(lastSearchQuery);
    }
  }, [lastSearchQuery, searchQuery]);
  
  // Ref to handle clicking outside the suggestion box
  const searchContainerRef = useRef<HTMLFormElement>(null);

  function scrollHandler() {
    if (window.scrollY >= 20) {
      updateNavbar(true);
    } else {
      updateNavbar(false);
    }
  }

  useEffect(() => {
    window.addEventListener("scroll", scrollHandler);
    // Click outside listener
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      window.removeEventListener("scroll", scrollHandler);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  const navigate = useNavigate()

  const user = useAuthStore(s => s.user)
  const initializing = useAuthStore(s => s.initializing)
  const logoutMutation = useLogout()

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch (e) {
      console.error('Logout failed', e)
    }

    try {
      localStorage.removeItem('email_previews_map')
    } catch (e) {}
    try {
      delete (await import('../api/client')).api.defaults.headers.common['Authorization']
    } catch (e) {}
    try {
      useAuthStore.getState().clearUser()
      useAuthStore.getState().clearAccessToken()
    } catch (e) {}

    navigate('/login')
  }

  // [NEW] Debounced auto-suggestions from API
  useEffect(() => {
    console.log('useEffect triggered - searchQuery:', searchQuery);
    const delayDebounceFn = setTimeout(async () => {
      console.log('debounce executed - searchQuery:', searchQuery);
      if (searchQuery.length >= 2) {
        try {
          console.log('calling API for:', searchQuery);
          const results = await mailApi.searchEmailsSemantic(searchQuery);
          console.log('API results:', results);
          const list = Array.isArray(results) ? results : [];
          console.log('setting suggestions:', list.length, 'items');
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          console.log('setShowSuggestions:', list.length > 0);
        } catch (error) {
          console.error("Auto-suggest failed", error);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } else {
        console.log('clearing suggestions');
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement> | React.FormEvent) => {
    if ((e as React.KeyboardEvent).key === 'Enter' || e.type === 'submit') {
      e.preventDefault();
      performSearch(searchQuery);
    }
  }

  // [NEW] Helper to trigger search navigation
  const performSearch = (query: string) => {
    setShowOffcanvas(false);
    setShowSuggestions(false);
    // Navigate triggers the Dashboard to load, which executes the Semantic Search
    navigate(`/dashboard?q=${encodeURIComponent(query)}`);
  }

  // [NEW] Handle clicking a suggestion
  const handleSuggestionClick = async (email: any) => {
    updateExpanded(false);
    setShowSuggestions(false);

    try {
      // Fetch full email data from API
      const data = await mailApi.getEmail(email.id);
      const message = data.latest || data.messages?.[0] || data;
      const senderStr = typeof message.sender === 'string'
        ? message.sender
        : (message.sender?.name || message.sender?.email || 'Unknown');

      const actualMessageId = message.id || message.message_id || email.id;
      const processedHtml = message.processedHtml || message.processed_html || message.body || message.decoded_body || '';

      // Set selected email in global context
      setSelectedEmail({
        ...message,
        id: email.id,
        messageId: actualMessageId,
        sender: senderStr,
        body: processedHtml,
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      });

      // Mark as read if unread
      if (email.unread) {
        try {
          await mailApi.modifyEmail(email.id, { unread: false });
        } catch (e) {
          console.error('Failed to mark email as read:', e);
        }
      }
    } catch (error) {
      console.error('Failed to load email details:', error);
    }
  }

  // [NEW] Mobile Sidebar (Offcanvas)
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [mobileMailboxes, setMobileMailboxes] = useState<any[]>([]);

  // [CHANGED] Load Mailboxes for Mobile Offcanvas when opening sidebar
  useEffect(() => {
    if (user && isMobile && showOffcanvas) {
      mailApi.listMailboxes()
        .then((data: any[]) => {
          const filtered = (data || []).map((box: any) => {
            const nameUpper = String(box.name || '').toUpperCase();
            let normalizedId = String(box.id || box.name || '').toLowerCase();
            let displayName = box.name || normalizedId;

            if (nameUpper === 'TODO' || nameUpper === 'TO DO') { normalizedId = 'todo'; displayName = 'Todo'; }
            else if (nameUpper === 'DONE') { normalizedId = 'done'; displayName = 'Done'; }
            else if (nameUpper === 'SNOOZED') { normalizedId = 'snoozed'; displayName = 'Snoozed'; }

            return { ...box, id: normalizedId, name: displayName };
          });
          const seenIds = new Set<string>();
          const uniqueFiltered = filtered.filter((box: any) => {
            if (seenIds.has(box.id)) return false;
            seenIds.add(box.id);
            return true;
          });
          setMobileMailboxes(uniqueFiltered);
        })
        .catch(err => console.error("Nav mailbox fetch error", err));
    }
  }, [user, isMobile, showOffcanvas]);

  // [CHANGED] Mobile folder click closes Offcanvas and navigates
  const handleMobileFolderClick = (folderId: string) => {
    setShowOffcanvas(false);
    navigate(`/dashboard?folder=${encodeURIComponent(folderId)}`);
  };

  const handleCloseOffcanvas = () => setShowOffcanvas(false);
  const handleShowOffcanvas = () => setShowOffcanvas(true);

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        {/* [NEW] Hamburger (mobile only) in place of logo */}
        <Button
          variant="link"
          className="d-md-none p-0 me-3 text-white border-0"
          onClick={handleShowOffcanvas}
          style={{ fontSize: '1.5rem', lineHeight: 1 }}
        >
          <FaBars />
        </Button>

        {/* [CHANGED] Logo hidden on mobile */}
        <Navbar.Brand href="/" className="d-none d-md-flex align-items-center">
          <img src={logo} className="img-fluid logo" alt="brand" />
        </Navbar.Brand>

        {/* [CHANGED] Compact search on mobile */}
        {user && (
          <Form 
            ref={searchContainerRef}
            className="d-flex mx-auto search-box-nav position-relative" 
            onSubmit={handleSearch} 
            style={{ maxWidth: isMobile ? '220px' : '400px', width: '100%' }}
          >
            <InputGroup size={isMobile ? 'sm' : undefined}>
              <InputGroup.Text className="bg-white border-end-0">
                <AiOutlineSearch />
              </InputGroup.Text>
              <Form.Control
                type="search"
                placeholder="Search emails..."
                className="border-start-0 ps-0"
                value={searchQuery}
                onChange={(e) => {
                  console.log('onChange - new value:', e.target.value);
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={handleSearch}
                onFocus={() => {
                    if (searchQuery.length >= 2 && suggestions.length > 0) setShowSuggestions(true);
                }}
                aria-label="Search"
              />
            </InputGroup>

            {/* [NEW] Type-ahead Suggestions Dropdown */}
            {(() => {
              const shouldShow = showSuggestions && suggestions.length > 0;
              console.log('dropdown render check - showSuggestions:', showSuggestions, 'suggestions.length:', suggestions.length, 'shouldShow:', shouldShow);
              return shouldShow;
            })() && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 9999
                }}
              >
                <ListGroup
                  className="shadow"
                  style={{
                      maxHeight: '400px',
                      overflowY: 'auto',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '4px',
                      backgroundColor: 'white'
                  }}
                >
                {suggestions.map((item: any, idx) => {
                   const subject = item.subject || "(No Subject)";
                   const senderName = typeof item.sender === 'string'
                        ? item.sender
                        : (item.sender?.name || item.sender?.email || "Unknown");

                   return (
                    <ListGroup.Item
                        key={item.id || idx}
                        action
                        onClick={() => handleSuggestionClick(item)}
                        className="d-flex flex-column border-start-0 border-end-0"
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="fw-bold text-truncate" style={{ fontSize: '0.9rem' }}>
                            {subject}
                        </div>
                        <div className="text-muted small text-truncate">
                            <span className="me-1">From:</span>
                            {senderName}
                        </div>
                    </ListGroup.Item>
                   )
                })}
                </ListGroup>
              </div>
            )}
          </Form>
        )}

        {/* [CHANGED] Remove mobile avatar Dropdown; use simple avatar to open Offcanvas */}
        {user && (
          <div className="d-md-none ms-2" onClick={handleShowOffcanvas} role="button" aria-label="Open menu">
            {(() => {
              const avatarUrl = user?.picture || user?.avatar;
              const displayName = ((user as any)?.name || user?.email || '?');
              const fallbackInitial = displayName.charAt(0).toUpperCase();
              return (
                <span className="d-inline-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="avatar"
                      roundedCircle
                      width={32}
                      height={32}
                      style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }}
                    />
                  ) : (
                    <span
                      aria-label="avatar"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        color: '#c95bf5',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        border: '2px solid rgba(255,255,255,0.9)'
                      }}
                    >
                      {fallbackInitial}
                    </span>
                  )}
                </span>
              )
            })()}
          </div>
        )}

        {/* [REMOVED on mobile] Navbar.Toggle and mobile Nav links under Collapse */}
        {/* Keep desktop nav only */}
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto" defaultActiveKey="#home">
            {!user ? (
              initializing ? null : (
                <>
                  <Nav.Item>
                    <Nav.Link
                      as={Link}
                      to="/login"
                      onClick={() => updateExpanded(false)}
                    >
                      <AiOutlineUser style={{ marginBottom: "2px" }} /> Sign in
                    </Nav.Link>
                  </Nav.Item>

                  <Nav.Item>
                    <Nav.Link
                      as={Link}
                      to="/signup"
                      onClick={() => updateExpanded(false)}
                    >
                      <ImBlog style={{ marginBottom: "2px" }} /> Sign up
                    </Nav.Link>
                  </Nav.Item>
                </>
              )
            ) : (
              <Nav.Item className="d-flex align-items-center">
                <Dropdown align="end">
                  <Dropdown.Toggle
                    id="user-dropdown"
                    variant="light"
                    className="d-flex align-items-center border-0 user-pill-toggle"
                  >
                    {(() => {
                      const email = user?.email ?? ''
                      const name = (user as any)?.name ?? ''
                      const provider = (user as any)?.provider as ('google' | 'email' | undefined)
                      const isGoogle = provider === 'google' || (!!user?.picture && !provider)
                      const displayName = isGoogle ? (name || email) : (name || email)
                      const avatarUrl = user?.picture || user?.avatar
                      const fallbackInitial = (displayName || '?').charAt(0).toUpperCase()
                      return (
                        <span className="d-flex align-items-center" style={{ color: '#fff' }}>
                          {avatarUrl ? (
                            <Image
                              src={avatarUrl}
                              alt="avatar"
                              roundedCircle
                              width={isMobile ? 28 : 32}
                              height={isMobile ? 28 : 32}
                              style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }}
                            />
                          ) : (
                            <span
                              aria-label="avatar"
                              style={{
                                width: isMobile ? 28 : 32,
                                height: isMobile ? 28 : 32,
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                color: '#c95bf5',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                border: '2px solid rgba(255,255,255,0.9)'
                              }}
                            >
                              {fallbackInitial}
                            </span>
                          )}
                          {/* [CHANGED] Hide display name on mobile */}
                          <span className="ms-2 d-none d-md-inline" style={{ fontSize: 13 }}>
                            {displayName}
                          </span>
                        </span>
                      )
                    })()}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="shadow border-0 purple-dropdown-menu">
                    <Dropdown.Header>
                      {(() => {
                        const email = user?.email ?? ''
                        const name = (user as any)?.name ?? ''
                        const provider = (user as any)?.provider as ('google' | 'email' | undefined)
                        const isGoogle = provider === 'google' || (!!user?.picture && !provider)
                        const displayName = isGoogle ? (name || email) : (name || email)
                        return (
                          <>
                            <span className="text-white-50">Signed in as</span>
                            <div style={{ fontWeight: 600, color: '#fff' }}>{displayName}</div>
                            {email ? (
                              <div className="text-white-50" style={{ fontSize: 12 }}>{email}</div>
                            ) : null}
                          </>
                        )
                      })()}
                    </Dropdown.Header>
                    <Dropdown.Divider style={{ borderTopColor: 'rgba(255,255,255,0.2)' }} />
                    <Dropdown.Item className="purple-dropdown-item" onClick={() => { handleLogout(); updateExpanded(false) }}>
                      <AiOutlineLogout className="logout-icon-blue" style={{ marginBottom: '2px' }} /> <span className="logout-text-blue">Logout</span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </Nav.Item>
            )}
          </Nav>
        </Navbar.Collapse>

        {/* [NEW] Offcanvas Sidebar for Mobile */}
        <Offcanvas
          show={showOffcanvas}
          onHide={handleCloseOffcanvas}
          responsive="md"
          placement="start"
          className="mobile-sidebar-offcanvas"
        >
          <Offcanvas.Header closeButton closeVariant="white">
            <Offcanvas.Title>
              <img src={logo} className="img-fluid" alt="brand" style={{ height: '32px' }} />
            </Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            {user ? (
              <div className="d-flex flex-column h-100">
                {/* User Info */}
                <div className="mobile-user-info mb-3 pb-3 border-bottom border-secondary">
                  <div className="d-flex align-items-center mb-2">
                    <span className="text-white fw-bold ps-2">{(user as any)?.name || user.email}</span>
                  </div>
                  <div className="small text-white-50 ps-2">{user.email}</div>
                </div>

                {/* Mailboxes */}
                <div className="mobile-mailboxes flex-grow-1 overflow-auto">
                  <div className="mobile-mailbox-section-header">Mailboxes</div>
                  {mobileMailboxes.map((box) => (
                    <div
                      key={box.id}
                      className="mobile-mailbox-item"
                      onClick={() => handleMobileFolderClick(box.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {getIconForFolder(box.id)}
                      <span className="ms-3 text-capitalize">{box.name}</span>
                    </div>
                  ))}
                </div>

                {/* Logout */}
                <div className="mt-auto pt-3 border-top border-secondary">
                  <Button variant="link" className="text-danger text-decoration-none px-0" onClick={handleLogout}>
                    <AiOutlineLogout className="me-2" /> Logout
                  </Button>
                </div>
              </div>
            ) : (
              <Nav className="flex-column">
                <Nav.Link as={Link} to="/login" onClick={handleCloseOffcanvas} className="text-white py-2">
                  <AiOutlineUser className="me-2" /> Sign in
                </Nav.Link>
                <Nav.Link as={Link} to="/signup" onClick={handleCloseOffcanvas} className="text-white py-2">
                  <ImBlog className="me-2" /> Sign up
                </Nav.Link>
              </Nav>
            )}
          </Offcanvas.Body>
        </Offcanvas>
      </Container>
    </Navbar>
  );
}

export default NavBar;