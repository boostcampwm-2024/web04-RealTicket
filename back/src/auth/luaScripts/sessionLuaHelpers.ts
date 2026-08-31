export const sessionWriteLuaHelpers = `
  local function prepareSessionWrite(sessionKey, session)
    local encodedSession = cjson.encode(session)
    local ttl = redis.call('PTTL', sessionKey)
    if ttl == -2 or ttl == 0 then
      return nil, nil, 'SESSION_EXPIRED_DURING_WRITE'
    end

    if ttl > 0 or ttl == -1 then
      return encodedSession, ttl, 'OK'
    end

    return nil, nil, 'SESSION_EXPIRED_DURING_WRITE'
  end

  local function writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)
    if ttl > 0 then
      redis.call('PSETEX', sessionKey, ttl, encodedSession)
      return
    end

    redis.call('SET', sessionKey, encodedSession)
  end
`;
