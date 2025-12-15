import { useState } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import logo from "../../public/logo-title.svg";
import { Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom'
// [Cập nhật] Thêm các component UI cho search
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";

import { ImBlog } from "react-icons/im";
import {
  AiOutlineFundProjectionScreen,
  AiOutlineUser,
  AiOutlineLogout,
  AiOutlineSearch, // [Cập nhật] Icon tìm kiếm
} from "react-icons/ai";
import useAuthStore from '../store/authStore'
import { useLogout } from '../hooks/useAuth'

function NavBar() {
  const [expand, updateExpanded] = useState(false);
  const [navColour, updateNavbar] = useState(false);
  
  // [Cập nhật] State lưu từ khóa tìm kiếm
  const [searchQuery, setSearchQuery] = useState(""); 

  function scrollHandler() {
    if (window.scrollY >= 20) {
      updateNavbar(true);
    } else {
      updateNavbar(false);
    }
  }

  window.addEventListener("scroll", scrollHandler);
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

  // [Cập nhật] Hàm xử lý khi người dùng submit tìm kiếm
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement> | React.FormEvent) => {
    // Chỉ xử lý khi nhấn Enter hoặc submit form
    if ((e as React.KeyboardEvent).key === 'Enter' || e.type === 'submit') {
      e.preventDefault();
      updateExpanded(false); // Đóng menu mobile nếu đang mở
      
      // Chuyển hướng sang trang Dashboard kèm tham số query
      // Ví dụ: /dashboard?q=marketing
      navigate(`/dashboard?q=${encodeURIComponent(searchQuery)}`);
    }
  }

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        <Navbar.Brand href="/" className="d-flex">
          <img src={logo} className="img-fluid logo" alt="brand" />
        </Navbar.Brand>
        
        {/* [Cập nhật] Thanh tìm kiếm - Chỉ hiện khi đã đăng nhập */}
        {user && (
          <Form className="d-flex mx-auto search-box-nav" onSubmit={handleSearch} style={{ maxWidth: '400px', width: '100%' }}>
            <InputGroup>
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
                aria-label="Search"
              />
            </InputGroup>
          </Form>
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
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto" defaultActiveKey="#home">
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/dashboard"
                onClick={() => updateExpanded(false)}
              >
                <AiOutlineFundProjectionScreen
                  style={{ marginBottom: "2px" }}
                />{" "}
                Dashboard
              </Nav.Link>
            </Nav.Item>

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
              <Nav.Item>
                <Nav.Link onClick={() => { handleLogout(); updateExpanded(false) }} aria-label="Logout">
                  <AiOutlineLogout style={{ marginBottom: "2px" }} /> Logout
                </Nav.Link>
              </Nav.Item>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;