import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';

import { runGetSeatsLua, runGetSectionSeatsLua } from './getSeatsLua';
import { runInitSectionSeatLua } from './initSectionSeatLua';
import { runSetSectionsLenLua } from './setSectionsLenLua';
import { runUpdateSeatLua } from './updateSeatLua';

const sectionKey = 'event:42:section:3:seats';

const commandContracts = [
  {
    fileName: 'getSeatsLua.ts',
    commandName: 'getSectionSeats',
    numberOfKeys: 2,
    invoke: (redis: Redis) => runGetSectionSeatsLua(redis, 42, 3),
    args: ['42', '3'],
    returnValues: [[1, 0, 1], [], null],
  },
  {
    fileName: 'updateSeatLua.ts',
    commandName: 'updateSeat',
    numberOfKeys: 1,
    invoke: (redis: Redis) => runUpdateSeatLua(redis, sectionKey, 8, 0),
    args: [sectionKey, '8', '0'],
    returnValues: [1, 0, null, 'nil'],
  },
  {
    fileName: 'initSectionSeatLua.ts',
    commandName: 'initSectionSeat',
    numberOfKeys: 1,
    invoke: (redis: Redis) => runInitSectionSeatLua(redis, sectionKey, '101001011'),
    args: [sectionKey, '101001011'],
    returnValues: [1],
  },
  {
    fileName: 'setSectionsLenLua.ts',
    commandName: 'setSectionsLen',
    numberOfKeys: 2,
    invoke: (redis: Redis) => runSetSectionsLenLua(redis, 42, 4),
    args: ['42', '4'],
    returnValues: ['OK'],
  },
];

function createCommandRedis() {
  const registeredCommand = jest.fn();
  const redis = {
    eval: jest.fn(),
    get: jest.fn(),
    defineCommand: jest.fn((commandName: string) => {
      Object.assign(redis, { [commandName]: registeredCommand });
    }),
  };

  return { redis: redis as unknown as Redis, registeredCommand };
}

describe.each(commandContracts)('$commandName 좌석 비트맵 Lua 명령 계약', (contract) => {
  it('직접 eval 없이 키 개수와 Lua 본문을 등록하고 같은 연결에서 재사용함', async () => {
    const { redis, registeredCommand } = createCommandRedis();
    registeredCommand.mockResolvedValue(contract.returnValues[0]);

    await contract.invoke(redis);
    await contract.invoke(redis);

    expect(redis.defineCommand).toHaveBeenCalledTimes(1);
    expect(redis.defineCommand).toHaveBeenCalledWith(contract.commandName, {
      numberOfKeys: contract.numberOfKeys,
      lua: expect.stringContaining('redis.call('),
    });
    expect(registeredCommand).toHaveBeenCalledTimes(2);
    expect(registeredCommand).toHaveBeenNthCalledWith(1, ...contract.args);
    expect(registeredCommand).toHaveBeenNthCalledWith(2, ...contract.args);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('서로 다른 Redis 인스턴스에는 각각 명령을 등록함', async () => {
    const firstClient = createCommandRedis();
    const secondClient = createCommandRedis();

    await contract.invoke(firstClient.redis);
    await contract.invoke(secondClient.redis);

    expect(firstClient.redis.defineCommand).toHaveBeenCalledTimes(1);
    expect(secondClient.redis.defineCommand).toHaveBeenCalledTimes(1);
    expect(firstClient.registeredCommand).toHaveBeenCalledWith(...contract.args);
    expect(secondClient.registeredCommand).toHaveBeenCalledWith(...contract.args);
  });

  it('명령의 반환값을 변환하지 않고 그대로 전달함', async () => {
    const { redis, registeredCommand } = createCommandRedis();

    for (const returnValue of contract.returnValues) {
      registeredCommand.mockResolvedValueOnce(returnValue);
      await expect(contract.invoke(redis)).resolves.toBe(returnValue);
    }
  });

  it('Redis 명령 실패를 호출자에게 그대로 전달함', async () => {
    const { redis, registeredCommand } = createCommandRedis();
    const commandError = new Error('Redis 명령 실행 실패');
    registeredCommand.mockRejectedValueOnce(commandError);

    await expect(contract.invoke(redis)).rejects.toBe(commandError);
  });

  it('명령 등록이 실패하면 다음 호출에서 다시 등록함', async () => {
    const { redis } = createCommandRedis();
    const registrationError = new Error('Redis 명령 등록 실패');
    (redis.defineCommand as jest.Mock).mockImplementationOnce(() => {
      throw registrationError;
    });

    await expect(contract.invoke(redis)).rejects.toBe(registrationError);
    await contract.invoke(redis);

    expect(redis.defineCommand).toHaveBeenCalledTimes(2);
  });

  it('소스에 직접 eval 호출을 남기지 않음', () => {
    const source = readFileSync(join(__dirname, contract.fileName), 'utf8');

    expect(source).toContain('redis.defineCommand(');
    expect(source).not.toMatch(/\bredis\.eval\s*\(/);
  });
});

describe('전체 좌석 조회 호환 함수', () => {
  it('섹션 순서대로 조회하면서 등록한 명령을 재사용함', async () => {
    const { redis, registeredCommand } = createCommandRedis();
    (redis.get as jest.Mock).mockResolvedValue('2');
    registeredCommand.mockResolvedValueOnce([1, 0]).mockResolvedValueOnce([0, 1, 1]);

    await expect(runGetSeatsLua(redis, 42)).resolves.toEqual([
      [1, 0],
      [0, 1, 1],
    ]);
    expect(redis.get).toHaveBeenCalledWith('event:42:sections:len');
    expect(registeredCommand).toHaveBeenNthCalledWith(1, '42', '0');
    expect(registeredCommand).toHaveBeenNthCalledWith(2, '42', '1');
    expect(redis.defineCommand).toHaveBeenCalledTimes(1);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('섹션 수가 없으면 명령을 등록하지 않고 null을 반환함', async () => {
    const { redis } = createCommandRedis();
    (redis.get as jest.Mock).mockResolvedValue(null);

    await expect(runGetSeatsLua(redis, 42)).resolves.toBeNull();
    expect(redis.defineCommand).not.toHaveBeenCalled();
  });

  it('섹션이 없으면 빈 목록을 반환함', async () => {
    const { redis } = createCommandRedis();
    (redis.get as jest.Mock).mockResolvedValue('0');

    await expect(runGetSeatsLua(redis, 42)).resolves.toEqual([]);
    expect(redis.defineCommand).not.toHaveBeenCalled();
  });

  it('조회 도중 섹션이 사라지면 null을 반환하고 나머지 조회를 중단함', async () => {
    const { redis, registeredCommand } = createCommandRedis();
    (redis.get as jest.Mock).mockResolvedValue('3');
    registeredCommand.mockResolvedValueOnce([1]).mockResolvedValueOnce(null);

    await expect(runGetSeatsLua(redis, 42)).resolves.toBeNull();
    expect(registeredCommand).toHaveBeenCalledTimes(2);
  });
});
