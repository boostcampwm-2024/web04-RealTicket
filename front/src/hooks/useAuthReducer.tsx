import { Dispatch, Reducer, useReducer } from 'react';

//TODO 로그인시 userId를 저장해야된다, 아니면
interface IAuthState {
  isSignIn: boolean;
}

interface IAuthAction {
  type: 'signIn' | 'logout';
}
//TODO 타입 정리
export type AuthDispatch = Dispatch<IAuthAction>;

const authReducer: Reducer<IAuthState, IAuthAction> = (state, action) => {
  switch (action.type) {
    case 'signIn':
      return { ...state, isSignIn: true };
    case 'logout':
      return { ...state, isSignIn: false };
  }
};

const AUTH_DEFAULT_STATE: IAuthState = {
  isSignIn: false,
};
//TODO useEffect 로그인 여부 확인
export const useAuthReducer = () => {
  const [authState, dispatch] = useReducer(authReducer, AUTH_DEFAULT_STATE);
  return { isSignIn: authState.isSignIn, dispatch };
};
