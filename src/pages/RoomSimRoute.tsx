import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomSimPage } from '../features/roomSim/RoomSimPage';

export const RoomSimRoute: React.FC = () => {
    const navigate = useNavigate();

    return <RoomSimPage onBack={() => navigate('/')} />;
};
