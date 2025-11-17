import "./login.css"; // Import file CSS cho template
import { FcGoogle } from "react-icons/fc"; // <--- THÊM IMPORT NÀY

function Login() {
  return (
    <div className="login_wrap_container">
      {" "}
      {/* Thêm container để CSS overflow: hidden hoạt động đúng */}
      <div className="login_wrap">
        <div className="ring">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div className="login_box">
          <h2>Login</h2>
          <input type="text" placeholder="Email" />
          <input className="mt_20" type="password" placeholder="Password" />
          <button className="mt_20" type="submit">
            Sign in
          </button>

          {/* --- PHẦN MỚI THÊM BẮT ĐẦU TỪ ĐÂY --- */}

          {/* Dải phân cách "or" */}
          <div className="divider mt_20">or</div>

          {/* Nút Login with Google */}
          <button type="button" className="btn-google mt_20">
            <FcGoogle /> {/* <--- Icon Google */}
            Login with Google
          </button>

          {/* --- KẾT THÚC PHẦN MỚI THÊM --- */}

          <div className="custom_flex">
            <a className="mt_20" href="#">
              Forget Password
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;