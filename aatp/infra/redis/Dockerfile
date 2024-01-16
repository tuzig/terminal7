FROM redis:alpine
RUN echo 'appendonly no' > /etc/redis.conf
RUN echo 'save ""'  >> /etc/redis.conf
CMD [ "redis-server", "/etc/redis.conf" ]
