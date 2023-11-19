FROM redis:alpine
RUN echo "appendonly no" >> /etc/redis.conf
CMD [ "redis-server", "/etc/redis.conf" ]
