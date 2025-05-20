import React from "react";

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

const FormSection: React.FC<FormSectionProps> = ({
  title,
  children,
  icon,
  className = "",
}) => {
  return (
    <div
      className={`mb-8 p-6 bg-gray-50/50 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all duration-300 backdrop-blur-sm ${className}`}
    >
      <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-3 border-b-2 border-gray-200 pb-3 group">
        {icon && (
          <span className="p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors duration-300">
            {icon}
          </span>
        )}
        {title}
      </h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
};

export default FormSection;
