// components/DateInput.js
import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const DateInput = ({ label, name, value, onChange, required = false }) => {
  const handleDateChange = (date) => {
    onChange({
      target: {
        name,
        value: date ? date.toISOString().split("T")[0] : "",
      },
    });
  };

  return (
    <div className="mb-4">
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
      </label>
      <DatePicker
        id={name}
        selected={value ? new Date(value) : null}
        onChange={handleDateChange}
        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
        dateFormat="yyyy-MM-dd"
        placeholderText={`Select ${label.toLowerCase()}`}
        required={required}
      />
    </div>
  );
};

export default DateInput;
