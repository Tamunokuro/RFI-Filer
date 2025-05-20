import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import FormWrapper from "./FormWrapper";
import FormInput from "./FormInput";
import FormButton from "./FormButton";
import { LoginFormData } from "../types";
import { UserIcon, LockClosedIcon } from "@heroicons/react/24/outline";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LoginFormData>({
    username: "",
    password: "",
  });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/api/token/", formData);
      localStorage.setItem(ACCESS_TOKEN, response.data.access);
      localStorage.setItem(REFRESH_TOKEN, response.data.refresh);
      navigate("/create-rfi");
    } catch (err: any) {
      console.error(err);
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormWrapper
      title="Welcome Back"
      onSubmit={handleSubmit}
      error={error}
      loading={loading}
    >
      <FormInput
        label="Username"
        name="username"
        value={formData.username}
        onChange={handleChange}
        placeholder="Enter your username"
        required
        icon={<UserIcon className="h-5 w-5 text-gray-400" />}
      />

      <FormInput
        label="Password"
        name="password"
        type="password"
        value={formData.password}
        onChange={handleChange}
        placeholder="Enter your password"
        required
        icon={<LockClosedIcon className="h-5 w-5 text-gray-400" />}
      />

      <div className="pt-2">
        <FormButton type="submit" loading={loading} disabled={loading}>
          Login
        </FormButton>
      </div>
    </FormWrapper>
  );
};

export default Login;
