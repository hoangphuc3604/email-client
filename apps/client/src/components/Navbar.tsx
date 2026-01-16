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
  FaTasks, FaClock, FaCheckSquare, FaFolder 
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

  // [NEW] Debounced Auto-Suggestion Logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) { // Start suggesting after 2 characters
        try {
          // Use Standard Search (Fast Autocomplete) for suggestions
          // We limit to 5 results for the dropdown
          const res = await mailApi.searchEmails(searchQuery, undefined, 1, 5);
          
          // Handle different response structures (previews array or threads array)
          const list = (res && res.previews) ? res.previews : (res && Array.isArray(res) ? res : (res && res.threads ? res.threads : []));
          
          setSuggestions(list);
          setShowSuggestions(true);
        } catch (error) {
          console.error("Auto-suggest failed", error);
          // Don't clear suggestions on error to avoid UI flickering, just stop showing
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300); // 300ms debounce

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
    updateExpanded(false);
    setShowSuggestions(false);
    // Navigate triggers the Dashboard to load, which executes the Semantic Search
    navigate(`/dashboard?q=${encodeURIComponent(query)}`);
  }

  // [NEW] Handle clicking a suggestion
  const handleSuggestionClick = (email: any) => {
    // We use the subject as the refined keyword
    const term = email.subject || "";
    setSearchQuery(term);
    performSearch(term);
  }

  // [NEW] Mobile Mailbox State
  const [mobileMailboxes, setMobileMailboxes] = useState<any[]>([]);

  // [NEW] Load Mailboxes for Mobile Menu when expanded
  useEffect(() => {
    if (user && isMobile && expand) {
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
  }, [user, isMobile, expand]);

  // [NEW] Handle Mobile Folder Click
  const handleMobileFolderClick = (folderId: string) => {
    updateExpanded(false);
    navigate(`/dashboard?folder=${encodeURIComponent(folderId)}`);
  };

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        <Navbar.Brand href="/" className="d-flex">
          {/* [CHANGED] Compact logo on mobile */}
          <img src={logo} className="img-fluid logo" alt="brand" style={{ height: isMobile ? 24 : 32 }} />
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
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                onFocus={() => {
                    if (searchQuery.length >= 2 && suggestions.length > 0) setShowSuggestions(true);
                }}
                aria-label="Search"
              />
            </InputGroup>

            {/* [NEW] Type-ahead Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ListGroup 
                className="position-absolute w-100 shadow mt-1" 
                style={{ 
                    top: '100%', 
                    zIndex: 1050, 
                    maxHeight: '300px', 
                    overflowY: 'auto',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '4px'
                }}
              >
                {suggestions.map((item: any, idx) => {
                   // Safe getters for subject and sender
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
            )}
          </Form>
        )}

        {/* [NEW] Mobile-only avatar next to search (circle only) */}
        {user && isMobile && (
          <Dropdown align="end" className="ms-2">
            <Dropdown.Toggle
              id="user-dropdown-mobile"
              variant="light"
              className="d-flex align-items-center border-0 user-pill-toggle"
            >
              {(() => {
                const email = user?.email ?? '';
                const name = (user as any)?.name ?? '';
                const provider = (user as any)?.provider as ('google' | 'email' | undefined);
                const isGoogle = provider === 'google' || (!!user?.picture && !provider);
                const displayName = isGoogle ? (name || email) : (name || email);
                const avatarUrl = user?.picture || user?.avatar;
                const fallbackInitial = (displayName || '?').charAt(0).toUpperCase();
                return (
                  <span className="d-flex align-items-center" style={{ color: '#fff' }}>
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="avatar"
                        roundedCircle
                        width={28}
                        height={28}
                        style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }}
                      />
                    ) : (
                      <span
                        aria-label="avatar"
                        style={{
                          width: 28,
                          height: 28,
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
            </Dropdown.Toggle>
            {/* Same dropdown menu as desktop (account info + Logout) */}
            <Dropdown.Menu className="shadow border-0 purple-dropdown-menu">
              <Dropdown.Header>
                {(() => {
                  const email = user?.email ?? '';
                  const name = (user as any)?.name ?? '';
                  const provider = (user as any)?.provider as ('google' | 'email' | undefined);
                  const isGoogle = provider === 'google' || (!!user?.picture && !provider);
                  const displayName = isGoogle ? (name || email) : (name || email);
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
        )}

        <Navbar.Toggle
          aria-controls="responsive-navbar-nav"
          onClick={() => {
            updateExpanded(!expand);
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </Navbar.Toggle>

        {/* [CHANGED] Collapse shows folder-column on mobile; desktop unchanged */}
        <Navbar.Collapse id="responsive-navbar-nav">
          {isMobile ? (
            // [CHANGED] Dynamic mobile folders from API
            <Nav className="w-100" defaultActiveKey="#inbox">
              {mobileMailboxes.length > 0 ? (
                mobileMailboxes.map((box) => (
                  <Nav.Item key={box.id}>
                    <Nav.Link
                      as="button"
                      onClick={() => handleMobileFolderClick(box.id)}
                      className="d-flex align-items-center bg-transparent border-0"
                      style={{ cursor: 'pointer' }}
                    >
                      {getIconForFolder(box.id)}
                      <span className="text-capitalize">{box.name}</span>
                    </Nav.Link>
                  </Nav.Item>
                ))
              ) : (
                <>
                  {/* Fallback to existing static links if API returns empty */}
                  {/* ...existing code...
                  <Nav.Item>
                    <Nav.Link as={Link} to="/dashboard?folder=inbox" onClick={() => updateExpanded(false)}>Inbox</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link as={Link} to="/dashboard?folder=starred" onClick={() => updateExpanded(false)}>Starred</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link as={Link} to="/dashboard?folder=sent" onClick={() => updateExpanded(false)}>Sent</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link as={Link} to="/dashboard?folder=drafts" onClick={() => updateExpanded(false)}>Drafts</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link as={Link} to="/dashboard?folder=trash" onClick={() => updateExpanded(false)}>Trash</Nav.Link>
                  </Nav.Item>
                  ...existing code... */}
                </>
              )}
            </Nav>
          ) : (
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
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;