import Redis from 'ioredis';

const getSeatsLua = `
  local eventId = KEYS[1]
  local sectionsLen = tonumber(redis.call('GET', 'event:'..eventId..':sections:len'))
  if not sectionsLen then return nil end
  
  local placeResult = {}
  local bitMasks = {128, 64, 32, 16, 8, 4, 2, 1}
  
  for i = 0, sectionsLen - 1 do
      local sectionKey = 'event:'..eventId..':section:'..i..':seats'
      local seatsLen = tonumber(redis.call('GET', sectionKey..':len'))
      if not seatsLen then return nil end
      
      local byteLen = math.ceil(seatsLen / 8)
      local rawBytes = redis.call('GETRANGE', sectionKey, 0, byteLen - 1)
      
      local sectionResult = {}
      local resultIndex = 1
      
      for byteIndex = 1, byteLen do
          local byte = string.byte(rawBytes, byteIndex) or 0
          
          for bitPos = 1, 8 do
              if resultIndex > seatsLen then break end
              sectionResult[resultIndex] = math.floor(byte / bitMasks[bitPos]) % 2
              resultIndex = resultIndex + 1
          end
          
          if resultIndex > seatsLen then break end
      end
      
      table.insert(placeResult, sectionResult)
  end
  
  return placeResult
`;

export async function runGetSeatsLua(redis: Redis, eventId: number): Promise<number[][] | null> {
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(getSeatsLua, 1, eventId);
}
