import { useState, useEffect } from "react";
import Preloader from "./components/Pre";
import Navbar from "./components/Navbar";
import AuthInitializer from './auth/AuthInitializer'
import Dashboard from "./components/Dashboard/Dashboard";
import ProtectedRoute from './components/Auth/ProtectedRoute'
import Footer from "./components/Footer";

import Login from "./components/Login/login";
import GoogleCallback from "./components/Login/GoogleCallback";
import Signup from "./components/Signup/Signup";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import "./style.css";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  const [load, updateLoad] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateLoad(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      <AuthInitializer />
      <Preloader load={load} />
      <div className="App" id={load ? "no-scroll" : "scroll"}>
        <Navbar />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/google-callback" element={<GoogleCallback />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Navigate to="/dashboard"/>} />
        </Routes>
        <Footer />
      </div>
    </Router>
  );
}


export default App;