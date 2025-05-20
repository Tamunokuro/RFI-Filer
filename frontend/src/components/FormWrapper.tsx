import React from "react";
import { FormProps } from "../types";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

const FormWrapper: React.FC<FormProps> = ({
  children,
  title,
  onSubmit,
  error,
  success,
  loading = false,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-blue-300/20 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-blue-300/20 blur-3xl -z-10" />
      <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full bg-indigo-200/20 blur-3xl -z-10" />

      <div className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 hover:shadow-2xl transition-all duration-300 p-8">
        <h2 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent tracking-tight">
          {title}
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-xl border-2 border-red-200 text-red-700 flex items-center space-x-3 animate-fade-in">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 rounded-xl border-2 border-green-200 text-green-700 flex items-center space-x-3 animate-fade-in">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <span>
              {typeof success === "string"
                ? success
                : "Operation completed successfully!"}
            </span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          {children}
        </form>
      </div>
    </div>
  );
};

export default FormWrapper;
