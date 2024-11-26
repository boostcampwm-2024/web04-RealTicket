import Redis from 'ioredis';

const getSeatsLua = `
  local eventId = KEYS[1]
  local sectionsLen = redis.call('GET', 'event:'..eventId..':sections:len')
  
  local placeResult = {}
  for i = 0, tonumber(sectionsLen)-1 do
    local seatsLen = redis.call('GET', 'event:'..eventId..':section:'..i..':seats:len')
    local sectionResult = {}
    for j = 0, tonumber(seatsLen)-1 do
      local seat = redis.call('GETBIT', 'event:'..eventId..':section:'..i..':seats', j)
      if not (seat == 0 or seat == 1) then
        return nil
      end
      table.insert(sectionResult, seat)
    end
    table.insert(placeResult, sectionResult)  
  end
  
  return placeResult
`;

export async function runGetSeatsLua(redis: Redis, eventId: number): Promise<number[][] | null> {
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(getSeatsLua, 1, eventId);
}
