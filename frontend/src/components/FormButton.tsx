import React from "react";

interface FormButtonProps {
  type?: "button" | "submit" | "reset";
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const FormButton: React.FC<FormButtonProps> = ({
  type = "button",
  children,
  onClick,
  disabled = false,
  variant = "primary",
  className = "",
  icon,
  loading = false,
  fullWidth = true,
}) => {
  const baseClasses = `flex items-center justify-center py-4 px-6 rounded-xl 
                      font-semibold text-lg shadow-lg hover:shadow-xl
                      transition-all duration-300
                      transform hover:scale-[1.02] active:scale-[0.98]
                      ${fullWidth ? "w-full" : ""}
                      disabled:cursor-not-allowed`;

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white hover:from-blue-700 hover:via-blue-800 hover:to-blue-900 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600",
    secondary:
      "bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 text-gray-800 hover:from-gray-200 hover:via-gray-300 hover:to-gray-400 disabled:text-gray-500",
    danger:
      "bg-gradient-to-r from-red-500 via-red-600 to-red-700 text-white hover:from-red-600 hover:via-red-700 hover:to-red-800 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Processing...
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

export default FormButton;
