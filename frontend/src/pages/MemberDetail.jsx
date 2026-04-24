import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../api";

import MemberCard from "../components/MemberCard";

const MemberDetail = () => {
  const { id } = useParams();
  const [member, setMember] = useState(null);

  useEffect(() => {
    const fetchMember = async () => {
      try {
        const res = await api.get(`/api/members/${id}/`);
        setMember(res.data);
      } catch (err) {
        console.error("Error fetching member:", err);
      }
    };
    fetchMember();
  }, [id]);

  if (!member) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4 flex justify-center">
      <MemberCard member={member} />
    </div>
  );
};

export default MemberDetail;
