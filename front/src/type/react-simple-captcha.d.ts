declare module 'react-simple-captcha' {
  import { Component } from 'react';

  // 캡챠 엔진 로드 함수의 시그니처
  export function loadCaptchaEnginge(
    numberOfCharacters: number,
    backgroundColor?: string,
    fontColor?: string,
    charMap?: 'upper' | 'lower' | 'numbers' | 'special_char',
  ): void;

  // 캡챠 검증 함수의 시그니처
  export function validateCaptcha(userValue: string, reload?: boolean): boolean;

  // 캡챠 템플릿 컴포넌트 (Reload 기능 포함)
  export class LoadCanvasTemplate extends Component<{
    reloadText?: string;
    reloadColor?: string;
  }> {}

  // 캡챠 템플릿 컴포넌트 (Reload 기능 없음)
  export class LoadCanvasTemplateNoReload extends Component {}
}
