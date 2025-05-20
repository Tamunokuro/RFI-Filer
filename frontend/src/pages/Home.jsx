import React from "react";
import CreateRfiForm from "../components/CreateRfiForm";
import RfiList from "../components/RfiList";

const Home = () => {
  return (
    <div>
      <h1>Home</h1>
      <CreateRfiForm />
      <RfiList />
    </div>
  );
};

export default Home;
