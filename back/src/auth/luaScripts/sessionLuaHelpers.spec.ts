import { sessionWriteLuaHelpers } from './sessionLuaHelpers';

describe('세션 쓰기 Lua 공용 helper', () => {
  it('TTL 보존 쓰기와 만료 판정 함수를 한 곳에서만 정의함', () => {
    expect(sessionWriteLuaHelpers).toContain('local function prepareSessionWrite');
    expect(sessionWriteLuaHelpers).toContain('local function writePreparedSessionPreservingTtl');
  });

  it('0 PTTL과 -2 PTTL을 만료 없는 세션 분기로 처리하지 않음', () => {
    expect(sessionWriteLuaHelpers).toContain('if ttl == -2 or ttl == 0 then');
    expect(sessionWriteLuaHelpers).toContain("return nil, nil, 'SESSION_EXPIRED_DURING_WRITE'");
  });

  it('쓰기 대상으로 통과시키는 TTL은 양수와 만료 없음(-1)뿐임', () => {
    expect(sessionWriteLuaHelpers).toContain('if ttl > 0 or ttl == -1 then');
    expect(sessionWriteLuaHelpers).toContain("return encodedSession, ttl, 'OK'");
  });

  it('양수 TTL은 PSETEX로 남은 시간을 보존함', () => {
    expect(sessionWriteLuaHelpers).toContain("redis.call('PSETEX', sessionKey, ttl, encodedSession)");
  });

  it('옵션 없는 SET은 만료 없는 세션에만 쓰임', () => {
    expect(sessionWriteLuaHelpers).toContain("redis.call('SET', sessionKey, encodedSession)");
    expect(sessionWriteLuaHelpers).not.toContain('KEEPTTL');
    expect(sessionWriteLuaHelpers).not.toMatch(/redis\.call\('SET', sessionKey, encodedSession, /);
  });

  it('TTL을 새로 갱신하는 명령을 쓰지 않음', () => {
    expect(sessionWriteLuaHelpers).not.toContain("redis.call('EXPIRE'");
    expect(sessionWriteLuaHelpers).not.toContain("redis.call('PEXPIRE'");
    expect(sessionWriteLuaHelpers).not.toContain("redis.call('SETEX'");
  });
});
