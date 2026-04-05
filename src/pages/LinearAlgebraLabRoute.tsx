import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LinearAlgebraLab } from '../components/LinearAlgebraLab';

export const LinearAlgebraLabRoute: React.FC = () => {
    const navigate = useNavigate();

    return <LinearAlgebraLab onBack={() => navigate('/')} />;
};
