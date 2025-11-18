import "./signup.css"; // Import file CSS
import { useNavigate } from "react-router-dom"; // <--- THÊM IMPORT NÀY

function Signup() {
  const navigate = useNavigate(); // <--- KHỞI TẠO HOOK

  // Hàm xử lý khi nhấn nút Sign In
  const handleNavigateToLogin = () => {
    navigate("/login"); // <--- CHUYỂN ĐẾN TRANG /login (bạn có thể đổi path nếu cần)
  };

  return (
    // Đã đổi tên class này
    <div className="signup_wrap_container">
      {/* Đã đổi tên class này */}
      <div className="signup_wrap">
        <div className="ring">
          <i></i>
          <i></i>
          <i></i>
        </div>
        {/* Đã đổi tên class này */}
        <div className="signup_box">
          <h2>Sign Up</h2>
          <input type="text" placeholder="User Name" />
          <input className="mt_20" type="email" placeholder="Email" />
          <input
            className="mt_20"
            type="password"
            placeholder="Create Password"
          />
          <input
            className="mt_20"
            type="password"
            placeholder="Confirm Password"
          />
          <button className="mt_20" type="submit">
            Sign Up
          </button>

          {/* --- PHẦN ĐÃ THAY ĐỔI BẮT ĐẦU TỪ ĐÂY --- */}

          {/* Dải phân cách "or" */}
          <div className="divider mt_20">or</div>

          {/* Nút Sign In mới */}
          <button
            type="button" // Quan trọng: không phải 'submit'
            className="mt_20"
            onClick={handleNavigateToLogin} // <--- GỌI HÀM KHI NHẤN
          >
            Sign In
          </button>

          {/* --- KẾT THÚC PHẦN THAY ĐỔI --- */}
        </div>
      </div>
    </div>
  );
}

export default Signup;